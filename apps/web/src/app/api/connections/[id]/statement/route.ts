/**
 * Card statement upload: the owner's Isracard/Amex .xlsx export stands in for a sync the card
 * site blocks. Parsing and the per-(card, charge month) replace/skip rules live in
 * @moneytrack/ingest statement-import.ts. The file is untrusted: size-capped before and after
 * reading, never echoed back or logged; the audit entry carries counts only.
 */
import { connections, eq } from "@moneytrack/db";
import {
  STATEMENT_FILE_PROVIDERS,
  StatementImportError,
  importStatementFile,
  parseStatementFile,
} from "@moneytrack/ingest";
import { NextResponse } from "next/server";
import { apiError, notFound } from "@/server/api-response";
import { writeAudit } from "@/server/auth";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

const STATEMENT_MAX_BYTES = 2 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

const tooLarge = () => apiError(413, "The file is larger than 2 MB", "file_too_large");

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const connection = ctx.db.select().from(connections).where(eq(connections.id, id)).get();
  if (!connection) {
    return notFound("Connection");
  }
  if (!STATEMENT_FILE_PROVIDERS.includes(connection.providerCode)) {
    return apiError(400, "Statement upload is not supported for this provider", "invalid_provider");
  }

  // Multipart overhead is small; a body far past the cap is refused before it is buffered.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > STATEMENT_MAX_BYTES + 64 * 1024) {
    return tooLarge();
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return apiError(400, "Expected a multipart upload with a file", "invalid_file");
  }
  if (!(file instanceof File) || file.size === 0) {
    return apiError(400, "Choose the card statement file (.xlsx)", "invalid_file");
  }
  if (file.size > STATEMENT_MAX_BYTES) {
    return tooLarge();
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > STATEMENT_MAX_BYTES) {
    return tooLarge();
  }

  try {
    const statement = parseStatementFile(bytes);
    const result = await importStatementFile(ctx.db, id, statement);
    writeAudit(ctx.db, "connection_statement_import", ctx.session.user.id, {
      connectionId: id,
      providerCode: connection.providerCode,
      cardMonths: statement.length,
      ingested: result.ingested,
      accounts: result.accounts,
      skippedMonths: result.skippedMonths.length,
    });
    return NextResponse.json({
      ingested: result.ingested,
      accounts: result.accounts,
      ...(result.skippedMonths.length > 0 ? { skippedMonths: result.skippedMonths } : {}),
    });
  } catch (error) {
    if (error instanceof StatementImportError) {
      return apiError(400, error.message, "invalid_statement");
    }
    console.error("[statement] import failed");
    return apiError(500, "Statement import failed", "import_failed");
  }
}

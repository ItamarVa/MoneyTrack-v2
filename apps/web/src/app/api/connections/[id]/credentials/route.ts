/**
 * Writes scraper login secrets for one connection into the OS credential vault.
 * This is the only path that populates `connections.credential_ref`; without it
 * every sync fails with "Vault secret not found" (see MEM-INGEST, MEM-SEC).
 * Invariant: secret values never reach SQLite, the audit log, or any response —
 * only the field names are recorded. There is no GET counterpart by design.
 */
import {
  ConnectionCredentialsRequestSchema,
  findProvider,
} from "@moneytrack/contracts";
import { connections, eq } from "@moneytrack/db";
import { storeSecret } from "@moneytrack/vault";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
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

  const provider = findProvider(connection.providerCode);
  if (!provider) {
    return apiError(400, "Connection provider does not support scraping", "invalid_provider");
  }

  let fields: Record<string, string>;
  try {
    fields = ConnectionCredentialsRequestSchema.parse(await request.json()).fields;
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }

  const submitted = Object.keys(fields).sort();
  const expected = [...provider.loginFields].sort();
  if (submitted.length !== expected.length || submitted.some((key, i) => key !== expected[i])) {
    return apiError(400, `Expected exactly these fields: ${expected.join(", ")}`, "invalid_fields");
  }

  await storeSecret(connection.credentialRef, JSON.stringify(fields));

  ctx.db
    .update(connections)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(connections.id, id))
    .run();

  writeAudit(ctx.db, "connection_credentials_set", ctx.session.user.id, {
    connectionId: id,
    providerCode: connection.providerCode,
    fields: expected,
  });

  return NextResponse.json({ ok: true });
}

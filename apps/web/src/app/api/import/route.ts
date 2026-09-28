import fs from "node:fs";
import { DataImportRequestSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { writeAudit } from "@/server/auth";
import { assertValidOrigin } from "@/server/csrf";
import { getServerDb } from "@/server/db";
import { guardApi } from "@/server/guard-api";
import {
  HA_IMPORT_MAX_UPLOAD_BYTES,
  runHaDataImport,
  saveUploadedImportBundle,
} from "@/server/import";
import { isHaAddonMode } from "@/server/runtime-mode";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  if (!isHaAddonMode()) {
    return apiError(403, "Import is only available in the Home Assistant add-on", "import_not_available");
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  let body: ReturnType<typeof DataImportRequestSchema.parse>;
  let upload: File | null = null;
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0 || file.size > HA_IMPORT_MAX_UPLOAD_BYTES) {
        return apiError(400, "Choose the export file (moneytrack-import.db)", "invalid_file");
      }
      upload = file;
      body = DataImportRequestSchema.parse({ exportPassphrase: form.get("exportPassphrase") });
    } else {
      body = DataImportRequestSchema.parse(await request.json());
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return zodErrorResponse(error);
    }
    return apiError(400, "Invalid request", "validation_error");
  }

  const uploadPath = upload ? saveUploadedImportBundle(new Uint8Array(await upload.arrayBuffer())) : null;
  try {
    const result = await runHaDataImport(body.exportPassphrase, uploadPath ?? undefined);
    writeAudit(await getServerDb(), "ha_data_import", ctx.session.user.id, {});
    return NextResponse.json({
      ok: true as const,
      importedAt: result.importedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "import_failed";
    if (message === "import_file_missing") {
      return apiError(404, "No import file found on the share", "import_file_missing");
    }
    if (message === "db_locked") {
      return apiError(423, "Unlock the database before importing", "db_locked");
    }
    console.error("[import] failed:", message);
    return apiError(400, "Import failed — check the export passphrase", "import_failed");
  } finally {
    if (uploadPath) {
      fs.rmSync(uploadPath, { force: true });
    }
  }
}

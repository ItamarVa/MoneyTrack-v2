import {
  ConnectionCreateRequestSchema,
  MANUAL_PROVIDER_CODE,
  findProvider,
} from "@moneytrack/contracts";
import { connections, eq } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { scraperCredentialRef } from "@/server/manual";
import { mapConnection } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const rows = ctx.db.select().from(connections).all();
  return NextResponse.json({ connections: rows.map(mapConnection) });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  try {
    const body = ConnectionCreateRequestSchema.parse(await request.json());
    if (body.providerCode === MANUAL_PROVIDER_CODE) {
      return apiError(400, "Manual provider cannot be created as a connection", "invalid_provider");
    }
    // Reject anything the scraper cannot serve, so no connection exists that can never sync.
    if (!findProvider(body.providerCode)) {
      return apiError(400, "Unknown provider", "invalid_provider");
    }

    const now = nowIso();
    const id = randomUUID();

    ctx.db.insert(connections).values({
      id,
      providerCode: body.providerCode,
      credentialRef: scraperCredentialRef(id),
      enabled: body.enabled,
      scheduleCron: body.scheduleCron ?? null,
      lastRunId: null,
      puppeteerProfileDir: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    writeAudit(ctx.db, "connection_create", ctx.session.user.id, {
      connectionId: id,
      providerCode: body.providerCode,
    });

    const row = ctx.db.select().from(connections).where(eq(connections.id, id)).get()!;
    return NextResponse.json(mapConnection(row), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

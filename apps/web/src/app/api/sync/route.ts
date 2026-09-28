import { randomUUID } from "node:crypto";
import {
  SyncJobCreateRequestSchema,
  SyncJobListResponseSchema,
  SyncJobResponseSchema,
} from "@moneytrack/contracts";
import { connections, eq, jobs } from "@moneytrack/db";
import { rowToJob } from "@moneytrack/ingest";
import { NextResponse } from "next/server";
import { apiError, notFound } from "@/server/api-response";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { hasLiveScrapeJob } from "@/server/sync-guard";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const guarded = await guardApi();
  if (guarded instanceof Response) {
    return guarded;
  }

  const body = SyncJobCreateRequestSchema.parse(await request.json());

  const connection = guarded.db
    .select()
    .from(connections)
    .where(eq(connections.id, body.connectionId))
    .get();
  if (!connection) {
    return notFound("Connection");
  }

  if (hasLiveScrapeJob(guarded.db.select().from(jobs).all(), body.connectionId, Date.now())) {
    return apiError(
      409,
      "A sync is already in progress for this connection",
      "sync_in_progress",
    );
  }

  const timestamp = nowIso();
  const jobId = randomUUID();

  guarded.db
    .insert(jobs)
    .values({
      id: jobId,
      kind: "scrape",
      payloadJson: JSON.stringify({ connectionId: body.connectionId }),
      status: "queued",
      otpPrompt: null,
      otpResponse: null,
      attempts: 0,
      errorClass: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  const row = guarded.db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!row) {
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  const response = SyncJobResponseSchema.parse({ job: rowToJob(row) });
  return NextResponse.json(response, { status: 201 });
}

export async function GET(): Promise<Response> {
  const guarded = await guardApi();
  if (guarded instanceof Response) {
    return guarded;
  }

  const rows = guarded.db
    .select()
    .from(jobs)
    .all()
    .filter((row) => row.kind === "scrape")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const response = SyncJobListResponseSchema.parse({
    jobs: rows.map(rowToJob),
  });
  return NextResponse.json(response);
}

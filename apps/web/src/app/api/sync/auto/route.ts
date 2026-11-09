/**
 * POST /api/sync/auto: the app was opened; enqueue a scrape job for every connection that is due
 * (last success older than 24h) under the shared bank-lockout guards in @moneytrack/ingest sync-due.
 * GET /api/sync/auto: per-connection live/failure state for the banner and the Accounts card,
 * with the failure class taken from the scrape run (the job row only says SYNC_FAILED).
 * Invariant: jobs are read after every await and inserted synchronously, so two tabs cannot both enqueue.
 * Manual POST /api/sync stays unrestricted. Used by components/sync/use-auto-sync.ts.
 */
import { randomUUID } from "node:crypto";
import { MANUAL_PROVIDER_CODE } from "@moneytrack/contracts";
import { connections, jobs, scrapeRuns } from "@moneytrack/db";
import {
  CREDENTIALS_MISSING_ERROR_CLASS,
  evaluateSyncDue,
  hasLiveJob,
  scrapeJobsFor,
} from "@moneytrack/ingest";
import { NextResponse } from "next/server";
import type {
  AutoSyncStartResponse,
  AutoSyncStateResponse,
  SyncConnectionState,
} from "@/components/sync/auto-sync-api";
import { assertValidOrigin } from "@/server/csrf";
import { loadConnectionStatuses } from "@/server/connection-status";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

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

  const rows = guarded.db
    .select()
    .from(connections)
    .all()
    .filter((row) => row.providerCode !== MANUAL_PROVIDER_CODE);
  const statuses = await loadConnectionStatuses(guarded.db, rows);

  // No await below: the read and the inserts happen in one synchronous step.
  const now = new Date();
  const allJobs = guarded.db.select().from(jobs).all();
  const started: string[] = [];
  const skipped: AutoSyncStartResponse["skipped"] = [];
  const timestamp = now.toISOString();

  for (const row of rows) {
    const status = statuses.get(row.id);
    const decision = evaluateSyncDue({
      connection: row,
      jobs: allJobs,
      now,
      mode: "on_open",
      lastSuccessAt: status?.lastSuccessAt ?? null,
      credentialsSet: status?.credentialsSet ?? false,
    });
    if (!decision.due) {
      skipped.push({ connectionId: row.id, reason: decision.reason });
      continue;
    }
    guarded.db
      .insert(jobs)
      .values({
        id: randomUUID(),
        kind: "scrape",
        payloadJson: JSON.stringify({ connectionId: row.id }),
        status: "queued",
        otpPrompt: null,
        otpResponse: null,
        attempts: 0,
        errorClass: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    started.push(row.id);
  }

  const body: AutoSyncStartResponse = { started, skipped };
  return NextResponse.json(body);
}

export async function GET(): Promise<Response> {
  const guarded = await guardApi();
  if (guarded instanceof Response) {
    return guarded;
  }

  const nowMs = Date.now();
  const allJobs = guarded.db.select().from(jobs).all();
  const runs = guarded.db.select().from(scrapeRuns).all();
  const states: SyncConnectionState[] = [];

  for (const row of guarded.db.select().from(connections).all()) {
    if (row.providerCode === MANUAL_PROVIDER_CODE || !row.enabled) {
      continue;
    }
    const scrapes = scrapeJobsFor(allJobs, row.id).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const latest = scrapes[0];
    const live = hasLiveJob(scrapes, nowMs);
    let failure: SyncConnectionState["failure"] = null;
    if (latest && latest.status === "failed") {
      failure = {
        errorClass: resolveFailureClass(row.id, latest.createdAt, latest.errorClass, runs),
        at: latest.updatedAt,
      };
    }
    states.push({
      connectionId: row.id,
      providerCode: row.providerCode,
      live,
      otpRequired: live && scrapes.some((job) => job.status === "otp_required"),
      failure,
    });
  }

  const body: AutoSyncStateResponse = { connections: states };
  return NextResponse.json(body);
}

function resolveFailureClass(
  connectionId: string,
  jobCreatedAt: string,
  jobClass: string | null,
  runs: readonly (typeof scrapeRuns.$inferSelect)[],
): string {
  if (jobClass === CREDENTIALS_MISSING_ERROR_CLASS) {
    return jobClass;
  }
  const run = runs
    .filter((r) => r.connectionId === connectionId && r.startedAt >= jobCreatedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (run?.status === "failed" && run.errorClass) {
    return run.errorClass;
  }
  return jobClass ?? "SYNC_FAILED";
}

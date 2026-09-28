import {
  type MoneyTrackDb,
  eq,
  jobs,
  compactDatabaseIfNeeded,
  pruneOldData,
} from "@moneytrack/db";
import { processSyncJob } from "@moneytrack/ingest";
import type { SyncRunnerDeps } from "@moneytrack/ingest";
import { persistNetWorthSnapshot, recomputeAllSchedules } from "@moneytrack/engine";
import { runFullReferenceRefresh, runScheduledReferenceRefresh } from "@moneytrack/market";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ClassifyJobsModule = {
  advanceClassifyBulkJob: (db: MoneyTrackDb, jobId: string) => boolean;
  findClassifyJobToRun: (db: MoneyTrackDb) => { id: string; status: string } | null;
};

async function loadClassifyJobs(): Promise<ClassifyJobsModule> {
  const modulePath = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "../../web/src/server/classify-jobs.js"),
  ).href;
  return import(modulePath) as Promise<ClassifyJobsModule>;
}

function nowIso(): string {
  return new Date().toISOString();
}

let lastPruneDay = "";

export async function processReferenceRefreshJob(
  db: MoneyTrackDb,
  jobId: string,
): Promise<void> {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) {
    return;
  }

  db.update(jobs)
    .set({ status: "running", updatedAt: nowIso() })
    .where(eq(jobs.id, jobId))
    .run();

  try {
    await runFullReferenceRefresh(db);
    recomputeAllSchedules(db);
    persistNetWorthSnapshot(db, nowIso().slice(0, 10));
    db.update(jobs)
      .set({ status: "done", updatedAt: nowIso(), errorClass: null })
      .where(eq(jobs.id, jobId))
      .run();
  } catch {
    db.update(jobs)
      .set({
        status: "failed",
        errorClass: "REFERENCE_REFRESH_FAILED",
        updatedAt: nowIso(),
      })
      .where(eq(jobs.id, jobId))
      .run();
  }
}

async function processCategorizeBulkJob(db: MoneyTrackDb, jobId: string): Promise<void> {
  const classifyJobs = await loadClassifyJobs();
  while (true) {
    const finished = classifyJobs.advanceClassifyBulkJob(db, jobId);
    if (finished) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

export async function processQueuedJobs(
  db: MoneyTrackDb,
  deps?: SyncRunnerDeps,
): Promise<number> {
  const queued = db
    .select()
    .from(jobs)
    .all()
    .filter(
      (row) =>
        (row.kind === "scrape" ||
          row.kind === "reference_refresh" ||
          row.kind === "categorize_bulk") &&
        row.status === "queued",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let processed = 0;
  for (const job of queued) {
    try {
      if (job.kind === "scrape") {
        await processSyncJob(db, job.id, deps);
      } else if (job.kind === "reference_refresh") {
        await processReferenceRefreshJob(db, job.id);
      } else if (job.kind === "categorize_bulk") {
        await processCategorizeBulkJob(db, job.id);
      }
      processed += 1;
    } catch {
      // ponytail: per-job failure is recorded on the row; keep draining the queue
    }
  }

  try {
    const classifyJobs = await loadClassifyJobs();
    const staleClassify = classifyJobs.findClassifyJobToRun(db);
    if (staleClassify && staleClassify.status === "running") {
      await processCategorizeBulkJob(db, staleClassify.id);
      processed += 1;
    }
  } catch {
    // ponytail: stale resume is best-effort
  }

  return processed;
}

export async function runAgentReferenceSchedule(db: MoneyTrackDb): Promise<string[]> {
  const result = await runScheduledReferenceRefresh(db);
  if (result.ran.length > 0) {
    recomputeAllSchedules(db);
    persistNetWorthSnapshot(db, nowIso().slice(0, 10));
  }

  const today = nowIso().slice(0, 10);
  if (lastPruneDay !== today) {
    try {
      const pruned = pruneOldData(db);
      const compact = compactDatabaseIfNeeded(db);
      lastPruneDay = today;
      process.stdout.write(
        `[agent] ${new Date().toISOString()} prune: ${pruned.summary}; compact: ${compact.detail}\n`,
      );
    } catch (error) {
      process.stdout.write(
        `[agent] ${new Date().toISOString()} prune error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return result.ran;
}

export function getPollIntervalMs(): number {
  const raw = process.env.AGENT_POLL_INTERVAL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : 60_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

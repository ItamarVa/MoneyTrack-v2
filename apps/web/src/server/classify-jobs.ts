/**
 * Background categorize_bulk jobs: enqueue on rule changes, chunked newest-month-first runner.
 * Progress lives in jobs.payload_json as { periods, done, updated }.
 * ponytail: single-user local app, one in-process runner, no lock table; agent resumes stale rows.
 */
import { randomUUID } from "node:crypto";
import { eq, jobs, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { periodFromDate, recomputeRollupsForTransactions } from "@moneytrack/engine";
import { reapplyRulesClassificationForPeriod } from "@/server/rules-helpers";

export type ClassifyBulkPayload = {
  periods: string[];
  done: number;
  updated: number;
};

const STALE_RUNNING_MS = 2 * 60 * 1000;
let runnerActive = false;

function nowIso(): string {
  return new Date().toISOString();
}

function parsePayload(raw: string): ClassifyBulkPayload {
  const parsed = JSON.parse(raw) as Partial<ClassifyBulkPayload>;
  return {
    periods: Array.isArray(parsed.periods) ? parsed.periods : [],
    done: typeof parsed.done === "number" ? parsed.done : 0,
    updated: typeof parsed.updated === "number" ? parsed.updated : 0,
  };
}

function writePayload(
  db: MoneyTrackDb,
  jobId: string,
  payload: ClassifyBulkPayload,
): void {
  db.update(jobs)
    .set({ payloadJson: JSON.stringify(payload), updatedAt: nowIso() })
    .where(eq(jobs.id, jobId))
    .run();
}

/** Distinct YYYY-MM values from transaction and charge dates, newest first. */
export function collectTransactionPeriods(db: MoneyTrackDb): string[] {
  const seen = new Set<string>();
  for (const row of db.select().from(transactions).all()) {
    seen.add(periodFromDate(row.transactionDate));
    seen.add(periodFromDate(row.chargeDate));
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}

/** Distinct YYYY-MM charge months, newest first (reapply-all scope). */
export function collectChargePeriods(db: MoneyTrackDb): string[] {
  const seen = new Set<string>();
  for (const row of db.select().from(transactions).all()) {
    seen.add(periodFromDate(row.chargeDate));
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}

function findLiveClassifyJob(db: MoneyTrackDb) {
  return db
    .select()
    .from(jobs)
    .all()
    .find(
      (row) =>
        row.kind === "categorize_bulk" &&
        (row.status === "queued" || row.status === "running"),
    );
}

function isStaleRunning(row: typeof jobs.$inferSelect): boolean {
  if (row.status !== "running") {
    return false;
  }
  const updatedAt = new Date(row.updatedAt).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_RUNNING_MS;
}

/** Enqueue when no queued/running job exists; returns the live job id or null if deduped. */
export function enqueueClassifyJob(db: MoneyTrackDb, periods?: string[]): string | null {
  const existing = findLiveClassifyJob(db);
  if (existing) {
    return null;
  }

  const id = randomUUID();
  const now = nowIso();
  const payload: ClassifyBulkPayload = {
    periods: periods ?? collectTransactionPeriods(db),
    done: 0,
    updated: 0,
  };

  db.insert(jobs)
    .values({
      id,
      kind: "categorize_bulk",
      payloadJson: JSON.stringify(payload),
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/** Return the live categorize_bulk job, creating one when none is queued/running. */
export function ensureClassifyJob(
  db: MoneyTrackDb,
  periods?: string[],
): typeof jobs.$inferSelect {
  const existing = findLiveClassifyJob(db);
  if (existing) {
    return existing;
  }

  const id = enqueueClassifyJob(db, periods);
  if (!id) {
    const live = findLiveClassifyJob(db);
    if (!live) {
      throw new Error("Failed to enqueue classify job");
    }
    return live;
  }

  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) {
    throw new Error("Failed to load classify job");
  }
  return row;
}

/** Process one month for a categorize_bulk job; returns true when the job finished. */
export function advanceClassifyBulkJob(db: MoneyTrackDb, jobId: string): boolean {
  const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!row || row.kind !== "categorize_bulk") {
    return true;
  }
  if (row.status === "done" || row.status === "failed") {
    return true;
  }

  const payload = parsePayload(row.payloadJson);

  if (row.status === "queued") {
    db.update(jobs)
      .set({ status: "running", updatedAt: nowIso() })
      .where(eq(jobs.id, jobId))
      .run();
  }

  if (payload.done >= payload.periods.length) {
    db.update(jobs)
      .set({ status: "done", updatedAt: nowIso(), errorClass: null })
      .where(eq(jobs.id, jobId))
      .run();
    return true;
  }

  const period = payload.periods[payload.done]!;
  const result = reapplyRulesClassificationForPeriod(db, period, { respectManual: true });
  if (result.transactionIds.length > 0) {
    recomputeRollupsForTransactions(db, result.transactionIds);
  }

  const nextPayload: ClassifyBulkPayload = {
    periods: payload.periods,
    done: payload.done + 1,
    updated: payload.updated + result.updated,
  };
  writePayload(db, jobId, nextPayload);

  if (nextPayload.done >= nextPayload.periods.length) {
    db.update(jobs)
      .set({ status: "done", updatedAt: nowIso(), errorClass: null })
      .where(eq(jobs.id, jobId))
      .run();
    return true;
  }

  return false;
}

export function findClassifyJobToRun(db: MoneyTrackDb): typeof jobs.$inferSelect | null {
  const candidates = db
    .select()
    .from(jobs)
    .all()
    .filter(
      (row) =>
        row.kind === "categorize_bulk" &&
        (row.status === "queued" || (row.status === "running" && isStaleRunning(row))),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return candidates[0] ?? null;
}

async function runClassifyLoop(db: MoneyTrackDb): Promise<void> {
  while (true) {
    const job = findLiveClassifyJob(db);
    if (!job) {
      break;
    }
    const finished = advanceClassifyBulkJob(db, job.id);
    if (finished) {
      break;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** Start the in-process runner after enqueue (web only). */
export function kickClassifyRunner(db: MoneyTrackDb): void {
  if (runnerActive) {
    return;
  }
  runnerActive = true;
  void runClassifyLoop(db).finally(() => {
    runnerActive = false;
  });
}

export function enqueueAndKickClassifyRunner(
  db: MoneyTrackDb,
  periods?: string[],
): typeof jobs.$inferSelect {
  const job = ensureClassifyJob(db, periods);
  kickClassifyRunner(db);
  return job;
}

/** Reapply classification for every distinct charge month. */
export function enqueueAndKickReapplyClassifyRunner(
  db: MoneyTrackDb,
): typeof jobs.$inferSelect {
  return enqueueAndKickClassifyRunner(db, collectChargePeriods(db));
}

export type ClassifyStatusResponse = {
  active: boolean;
  status: "queued" | "running" | null;
  done: number;
  total: number;
  updated: number;
  lastFinished: { updated: number; finishedAt: string } | null;
};

export function getClassifyStatus(db: MoneyTrackDb): ClassifyStatusResponse {
  const live = findLiveClassifyJob(db);
  if (live) {
    const payload = parsePayload(live.payloadJson);
    return {
      active: true,
      status: live.status as "queued" | "running",
      done: payload.done,
      total: payload.periods.length,
      updated: payload.updated,
      lastFinished: null,
    };
  }

  const lastDone = db
    .select()
    .from(jobs)
    .all()
    .filter((row) => row.kind === "categorize_bulk" && row.status === "done")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  if (!lastDone) {
    return {
      active: false,
      status: null,
      done: 0,
      total: 0,
      updated: 0,
      lastFinished: null,
    };
  }

  const payload = parsePayload(lastDone.payloadJson);
  return {
    active: false,
    status: null,
    done: payload.done,
    total: payload.periods.length,
    updated: payload.updated,
    lastFinished: {
      updated: payload.updated,
      finishedAt: lastDone.updatedAt,
    },
  };
}

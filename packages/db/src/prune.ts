/**
 * Daily retention pass: raw scrape copies, logs, categorization history, finished jobs.
 * Null transactions.first_seen_raw_id before deleting raw rows (FK trap from reset script).
 * Raw copies: keep only the latest successful run per connection (+ in-flight runs).
 * File shrink: compactDatabaseIfNeeded() after prune when freelist exceeds 20%.
 */
import { and, inArray, lt } from "drizzle-orm";
import type { MoneyTrackDb } from "./connection.js";
import {
  auditLog,
  categorizationDecisions,
  jobs,
  loginAttempts,
  rawAccounts,
  rawTransactions,
  scrapeRuns,
  sessions,
  transactionRevisions,
  transactions,
} from "./schema.js";

const LOG_RETENTION_DAYS = 90;
const JOB_RETENTION_DAYS = 30;

const IN_FLIGHT_RUN_STATUSES = new Set(["running", "otp_required"]);

export type PruneResult = {
  rawRunsDeleted: number;
  rawTransactionsDeleted: number;
  rawAccountsDeleted: number;
  auditLogDeleted: number;
  loginAttemptsDeleted: number;
  transactionRevisionsDeleted: number;
  categorizationDecisionsDeleted: number;
  jobsDeleted: number;
  sessionsDeleted: number;
  summary: string;
};

function cutoffIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function scrapeRunIdsToKeep(list: typeof scrapeRuns.$inferSelect[]): Set<string> {
  const keep = new Set<string>();
  for (const run of list) {
    if (IN_FLIGHT_RUN_STATUSES.has(run.status)) {
      keep.add(run.id);
    }
  }
  const latestSuccess = list
    .filter((run) => run.status === "success")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (latestSuccess) {
    keep.add(latestSuccess.id);
  }
  return keep;
}

function pruneRawScrapeCopies(db: MoneyTrackDb): {
  runs: number;
  rawTx: number;
  rawAccounts: number;
} {
  const runsByConnection = new Map<string, typeof scrapeRuns.$inferSelect[]>();
  for (const run of db.select().from(scrapeRuns).all()) {
    const list = runsByConnection.get(run.connectionId) ?? [];
    list.push(run);
    runsByConnection.set(run.connectionId, list);
  }

  const runsToDelete: string[] = [];
  for (const [, list] of runsByConnection) {
    const keep = scrapeRunIdsToKeep(list);
    for (const run of list) {
      if (!keep.has(run.id)) {
        runsToDelete.push(run.id);
      }
    }
  }

  if (runsToDelete.length === 0) {
    return { runs: 0, rawTx: 0, rawAccounts: 0 };
  }

  const rawIds = db
    .select({ id: rawTransactions.id })
    .from(rawTransactions)
    .where(inArray(rawTransactions.runId, runsToDelete))
    .all()
    .map((row) => row.id);

  if (rawIds.length > 0) {
    db.update(transactions)
      .set({ firstSeenRawId: null })
      .where(inArray(transactions.firstSeenRawId, rawIds))
      .run();
  }

  const rawTxDeleted = db
    .delete(rawTransactions)
    .where(inArray(rawTransactions.runId, runsToDelete))
    .run().changes;

  const rawAccountsDeleted = db
    .delete(rawAccounts)
    .where(inArray(rawAccounts.runId, runsToDelete))
    .run().changes;

  const runsDeleted = db
    .delete(scrapeRuns)
    .where(inArray(scrapeRuns.id, runsToDelete))
    .run().changes;

  return { runs: runsDeleted, rawTx: rawTxDeleted, rawAccounts: rawAccountsDeleted };
}

function pruneCategorizationDecisions(db: MoneyTrackDb): number {
  const rows = db.select().from(categorizationDecisions).all();
  const byTxn = new Map<string, typeof categorizationDecisions.$inferSelect[]>();
  for (const row of rows) {
    const list = byTxn.get(row.transactionId) ?? [];
    list.push(row);
    byTxn.set(row.transactionId, list);
  }

  const keepIds = new Set<string>();
  for (const [, decisions] of byTxn) {
    const sorted = [...decisions].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
    for (const row of sorted) {
      if (row.decidedBy === "manual") {
        keepIds.add(row.id);
      }
    }
    const newest = sorted.at(-1);
    if (newest) {
      keepIds.add(newest.id);
    }
  }

  const deleteIds = rows.filter((row) => !keepIds.has(row.id)).map((row) => row.id);
  if (deleteIds.length === 0) {
    return 0;
  }

  return db
    .delete(categorizationDecisions)
    .where(inArray(categorizationDecisions.id, deleteIds))
    .run().changes;
}

export function pruneOldData(db: MoneyTrackDb): PruneResult {
  const logCutoff = cutoffIso(LOG_RETENTION_DAYS);
  const jobCutoff = cutoffIso(JOB_RETENTION_DAYS);

  const raw = pruneRawScrapeCopies(db);

  const auditLogDeleted = db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, logCutoff))
    .run().changes;

  const loginAttemptsDeleted = db
    .delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, logCutoff))
    .run().changes;

  const transactionRevisionsDeleted = db
    .delete(transactionRevisions)
    .where(lt(transactionRevisions.revisedAt, logCutoff))
    .run().changes;

  const categorizationDecisionsDeleted = pruneCategorizationDecisions(db);

  const jobsDeleted = db
    .delete(jobs)
    .where(
      and(
        inArray(jobs.status, ["done", "failed"]),
        lt(jobs.updatedAt, jobCutoff),
      ),
    )
    .run().changes;

  const nowIso = new Date().toISOString();
  const sessionsDeleted = db
    .delete(sessions)
    .where(lt(sessions.expiresAt, nowIso))
    .run().changes;

  const result: PruneResult = {
    rawRunsDeleted: raw.runs,
    rawTransactionsDeleted: raw.rawTx,
    rawAccountsDeleted: raw.rawAccounts,
    auditLogDeleted,
    loginAttemptsDeleted,
    transactionRevisionsDeleted,
    categorizationDecisionsDeleted,
    jobsDeleted,
    sessionsDeleted,
    summary: [
      `raw runs ${raw.runs}`,
      `raw tx ${raw.rawTx}`,
      `audit ${auditLogDeleted}`,
      `login ${loginAttemptsDeleted}`,
      `revisions ${transactionRevisionsDeleted}`,
      `decisions ${categorizationDecisionsDeleted}`,
      `jobs ${jobsDeleted}`,
      `sessions ${sessionsDeleted}`,
    ].join(", "),
  };

  return result;
}

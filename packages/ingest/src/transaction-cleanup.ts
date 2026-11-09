/**
 * Deletes statement-file stand-in rows (`transactions.source = 'file'`) when a newer file or a
 * sync replaces their (account, charge month). No foreign key cascades in the schema, so every
 * referencing row (tags, splits, decisions, revisions, links, alerts) goes first, explicitly.
 * Callers wrap the call in a DB transaction and feed the returned periods to recomputeRollups.
 * Used by sync-runner.ts (sync takes over a month) and statement-import.ts (file replaces file).
 */
import {
  type MoneyTrackDb,
  alerts,
  and,
  categorizationDecisions,
  eq,
  inArray,
  like,
  or,
  transactionLinks,
  transactionRevisions,
  transactionSplits,
  transactionTags,
  transactions,
} from "@moneytrack/db";
import { markDirtyPeriodsForTransaction } from "@moneytrack/engine";

type TransactionRow = typeof transactions.$inferSelect;

/** Rows of one account whose charge date falls in `month` ("YYYY-MM"). */
export function chargeMonthRows(
  db: MoneyTrackDb,
  accountId: string,
  month: string,
): TransactionRow[] {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), like(transactions.chargeDate, `${month}-%`)))
    .all();
}

/** Delete rows and everything that references them; returns the rollup periods they touched. */
export function deleteTransactionsCascade(db: MoneyTrackDb, rows: readonly TransactionRow[]): Set<string> {
  const dirty = new Set<string>();
  if (rows.length === 0) {
    return dirty;
  }
  const ids = rows.map((row) => row.id);
  for (const row of rows) {
    markDirtyPeriodsForTransaction(row, dirty);
  }
  db.delete(transactionTags).where(inArray(transactionTags.transactionId, ids)).run();
  db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, ids)).run();
  db.delete(categorizationDecisions).where(inArray(categorizationDecisions.transactionId, ids)).run();
  db.delete(transactionRevisions).where(inArray(transactionRevisions.transactionId, ids)).run();
  db.delete(transactionLinks)
    .where(or(inArray(transactionLinks.fromId, ids), inArray(transactionLinks.toId, ids)))
    .run();
  db.delete(alerts).where(inArray(alerts.transactionId, ids)).run();
  db.delete(transactions).where(inArray(transactions.id, ids)).run();
  return dirty;
}

/** Remove the file rows of (account, month) that the current ingest did not match. */
export function removeUnmatchedFileRows(
  db: MoneyTrackDb,
  accountId: string,
  month: string,
  keepIds: ReadonlySet<string>,
): Set<string> {
  const stale = chargeMonthRows(db, accountId, month).filter(
    (row) => row.source === "file" && !keepIds.has(row.id),
  );
  return deleteTransactionsCascade(db, stale);
}

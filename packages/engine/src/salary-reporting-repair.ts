/**
 * One-shot repair: recompute reporting_period for all unlocked salary rows and refresh
 * the rollups of every period the correction touched (old and new buckets).
 * Exists because an earlier month-overflow bug persisted wrong periods that per-run
 * applySalaryReportingPeriods(runId) never revisits. Idempotent; called at agent startup.
 */
import { transactions, type MoneyTrackDb } from "@moneytrack/db";
import { applySalaryReportingPeriods } from "./analysis-filter.js";
import { periodFromDate } from "./dates.js";
import { recomputeRollups } from "./rollups.js";

export function repairSalaryReportingPeriods(db: MoneyTrackDb): number {
  const before = new Map(
    db
      .select({ id: transactions.id, period: transactions.reportingPeriod })
      .from(transactions)
      .all()
      .map((row) => [row.id, row.period] as const),
  );

  const updated = applySalaryReportingPeriods(db);
  if (updated === 0) {
    return 0;
  }

  const dirty = new Set<string>();
  for (const txn of db.select().from(transactions).all()) {
    if (before.get(txn.id) === txn.reportingPeriod) {
      continue;
    }
    const old = before.get(txn.id);
    if (old) dirty.add(old);
    if (txn.reportingPeriod) dirty.add(txn.reportingPeriod);
    dirty.add(periodFromDate(txn.transactionDate));
    dirty.add(periodFromDate(txn.chargeDate));
  }
  recomputeRollups(db, dirty);
  return updated;
}

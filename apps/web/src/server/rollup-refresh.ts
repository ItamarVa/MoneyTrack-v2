/**
 * Web-layer helper: refresh materialized rollups after a mutation that changes totals.
 */
import type { MoneyTrackDb } from "@moneytrack/db";
import {
  recomputeRollupsForAllTransactions,
  recomputeRollupsForTransactions,
} from "@moneytrack/engine";

export function refreshRollupsForTransactions(
  db: MoneyTrackDb,
  transactionIds: readonly string[],
): void {
  if (transactionIds.length === 0) {
    return;
  }
  recomputeRollupsForTransactions(db, transactionIds);
}

export function refreshAllRollups(db: MoneyTrackDb): void {
  recomputeRollupsForAllTransactions(db);
}

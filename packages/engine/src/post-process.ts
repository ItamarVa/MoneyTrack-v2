import { eq, rawTransactions, scrapeRuns, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { applyFxForRun } from "./fx.js";
import { processCardSettlements } from "./card-settlements.js";
import { collectInstallmentPeriods } from "./installments.js";
import {
  processInternalTransfers,
  processRefunds,
  processSettlementMatching,
} from "./links.js";
import { markDirtyPeriodsForTransaction, recomputeRollups } from "./rollups.js";

export type EnginePostProcessOptions = {
  runId: string;
  fxRateLookup?: (currency: string, asOf: string) => Promise<number | null>;
};

export type EnginePostProcessResult = {
  fxUpdated: number;
  settlementsExcluded: number;
  settlementsMatched: number;
  transfersLinked: number;
  refundsMatched: number;
  rollupRowsWritten: number;
  dirtyPeriods: string[];
};

export async function runEnginePostProcess(
  db: MoneyTrackDb,
  options: EnginePostProcessOptions,
): Promise<EnginePostProcessResult> {
  const dirtyPeriods = new Set<string>();
  const run = db.select().from(scrapeRuns).where(eq(scrapeRuns.id, options.runId)).get();
  if (!run) {
    throw new Error(`Scrape run not found: ${options.runId}`);
  }

  const rawIds = db
    .select()
    .from(rawTransactions)
    .where(eq(rawTransactions.runId, options.runId))
    .all()
    .map((row) => row.id);

  const touched = db
    .select()
    .from(transactions)
    .all()
    .filter((row) => row.firstSeenRawId && rawIds.includes(row.firstSeenRawId));

  for (const txn of touched) {
    markDirtyPeriodsForTransaction(txn, dirtyPeriods);
  }

  collectInstallmentPeriods(db, options.runId).forEach((period) => dirtyPeriods.add(period));

  const fxUpdated = await applyFxForRun(db, options.runId, options.fxRateLookup);
  const refundsMatched = processRefunds(db, dirtyPeriods);
  // Issuer-level exclusion must run before the card-level matcher, which only
  // looks at settlements that are still counted.
  const settlementsExcluded = processCardSettlements(db, dirtyPeriods);
  const settlementsMatched = processSettlementMatching(db, dirtyPeriods);
  const transfersLinked = processInternalTransfers(db, dirtyPeriods);
  const rollupRowsWritten = recomputeRollups(db, dirtyPeriods);

  return {
    fxUpdated,
    settlementsExcluded,
    settlementsMatched,
    transfersLinked,
    refundsMatched,
    rollupRowsWritten,
    dirtyPeriods: [...dirtyPeriods].sort(),
  };
}

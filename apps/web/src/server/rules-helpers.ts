/**
 * Rule preview counts and period-scoped bulk re-apply for background classification.
 * Match logic mirrors packages/classify matchRule (substring on normalized description).
 */
import { classifyTransaction, normalizeMerchant } from "@moneytrack/classify";
import { eq, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { periodFromDate } from "@moneytrack/engine";

export function countPatternMatches(db: MoneyTrackDb, pattern: string): number {
  const needle = pattern.trim().toLowerCase();
  if (!needle) return 0;

  let count = 0;
  for (const row of db.select().from(transactions).all()) {
    const normalized =
      row.descriptionNormalized?.trim() ||
      normalizeMerchant(row.descriptionRaw);
    if (normalized.includes(needle)) {
      count += 1;
    }
  }
  return count;
}

function transactionInPeriod(
  row: typeof transactions.$inferSelect,
  period: string,
): boolean {
  return (
    periodFromDate(row.transactionDate) === period ||
    periodFromDate(row.chargeDate) === period
  );
}

/** Classify every transaction in a charge/transaction month; respects manual locks. */
export function reapplyRulesClassificationForPeriod(
  db: MoneyTrackDb,
  period: string,
  options?: { respectManual?: boolean },
): { updated: number; skippedManual: number; transactionIds: string[] } {
  const respectManual = options?.respectManual ?? true;
  let updated = 0;
  let skippedManual = 0;
  const transactionIds: string[] = [];

  for (const row of db.select().from(transactions).all()) {
    if (!transactionInPeriod(row, period)) {
      continue;
    }
    transactionIds.push(row.id);

    const before = row.categoryId;
    const outcome = classifyTransaction(db, row.id, { respectManual });
    if (!outcome) continue;
    if (outcome.skippedManual) {
      skippedManual += 1;
      continue;
    }
    const after = db.select().from(transactions).where(eq(transactions.id, row.id)).get();
    if (after && after.categoryId !== before) {
      updated += 1;
    }
  }

  return { updated, skippedManual, transactionIds };
}

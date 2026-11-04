/**
 * Rule preview counts and period-scoped bulk re-apply for background classification.
 * Match logic mirrors packages/classify matchRule (substring on normalized description).
 */
import { classifyTransaction, loadEnabledRules, normalizeMerchant } from "@moneytrack/classify";
import { accounts, eq, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { periodFromDate, retagTransactionKind } from "@moneytrack/engine";

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
  // Loaded once per pass, not once per transaction.
  const rules = loadEnabledRules(db);
  const accountKinds = new Map(
    db.select().from(accounts).all().map((account) => [account.id, account.kind] as const),
  );
  let updated = 0;
  let skippedManual = 0;
  const transactionIds: string[] = [];

  for (const row of db.select().from(transactions).all()) {
    if (!transactionInPeriod(row, period)) {
      continue;
    }
    transactionIds.push(row.id);

    // Rows stored before a kind-pattern change pick it up here; the caller's rollup
    // recompute over transactionIds covers the changed totals.
    const accountKind = accountKinds.get(row.accountId);
    if (accountKind) {
      retagTransactionKind(db, row, accountKind);
    }

    const before = row.categoryId;
    const outcome = classifyTransaction(db, row.id, { respectManual, rules });
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

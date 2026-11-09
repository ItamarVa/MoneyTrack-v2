/**
 * Shared row loader for the transaction-scanning detectors (subscriptions, anomalies,
 * duplicates) and the stale-alert sweep. One place decides which rows can raise an alert:
 * only real household spend. Transfers, card settlements, loan payments, income, refunds,
 * excluded rows, business-scope accounts and the taxes & fees / neutral system categories
 * never qualify. Depends on: alerts.test.ts, index.ts. Ids mirror @moneytrack/classify
 * SYSTEM_CATEGORY_IDS (not imported: alerts does not depend on classify).
 */
import { accounts, transactions, type MoneyTrackDb } from "@moneytrack/db";

export type DetectableTransaction = typeof transactions.$inferSelect;

const IGNORED_KINDS = new Set([
  "transfer",
  "card_settlement",
  "loan_payment",
  "income",
  "refund",
]);

const IGNORED_CATEGORY_IDS = new Set([
  "00000000-0000-4000-8000-0000000000d0", // taxes & fees
  "00000000-0000-4000-8000-0000000000b1", // savings
  "00000000-0000-4000-8000-0000000000c2", // internal transfers
  "00000000-0000-4000-8000-0000000000c3", // card bills
  "00000000-0000-4000-8000-000000000043", // loans & mortgage
]);

function isEligible(row: DetectableTransaction, businessAccountIds: Set<string>): boolean {
  return (
    row.direction === "debit" &&
    !IGNORED_KINDS.has(row.kind) &&
    !row.excludedFromTotals &&
    !businessAccountIds.has(row.accountId) &&
    !(row.categoryId && IGNORED_CATEGORY_IDS.has(row.categoryId))
  );
}

/** Debit rows that may raise subscription / anomaly / duplicate alerts. */
export function loadDetectableTransactions(db: MoneyTrackDb): DetectableTransaction[] {
  const businessAccountIds = new Set(
    db
      .select()
      .from(accounts)
      .all()
      .filter((row) => row.scope === "business")
      .map((row) => row.id),
  );
  return db
    .select()
    .from(transactions)
    .all()
    .filter((row) => isEligible(row, businessAccountIds));
}

/**
 * Transaction-level ring slices for entity-page drill-down.
 * Pure helpers: map Transaction rows to CategoryBreakdownItem slices and filter
 * direct-on-parent category rows. Depends on @moneytrack/contracts and client-safe
 * expenseContribution (not @moneytrack/engine).
 */
import type { CategoryBreakdownItem, Transaction } from "@moneytrack/contracts";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import { expenseContribution } from "@/lib/transaction-amounts";

/**
 * Marks a slice whose categoryId is really a transaction id, so click handlers
 * open the drawer instead of drilling as if it were a category.
 */
export const TRANSACTION_RING_SOURCE_VIEW = "entity-transaction-ring";

/** Resolved category on a list/detail Transaction; no category means the seeded uncategorized bucket. */
export function resolvedCategoryId(txn: Transaction): string {
  return txn.categoryId ?? UNCATEGORIZED_CATEGORY_ID;
}

/** Label: bank description, then normalized merchant text, then transaction date. */
export function transactionSliceLabel(txn: Transaction): string {
  const description = txn.descriptionRaw.trim();
  if (description) {
    return description;
  }
  const merchant = txn.descriptionNormalized.trim();
  if (merchant) {
    return merchant;
  }
  return txn.transactionDate;
}

export function transactionsToBreakdownItems(txns: Transaction[]): CategoryBreakdownItem[] {
  return txns.map((txn) => ({
    categoryId: txn.id,
    categoryName: transactionSliceLabel(txn),
    amountIls: expenseContribution(txn),
    transactionCount: 1,
    drillDown: {
      filter: { dateBasis: "transaction" },
      sourceView: TRANSACTION_RING_SOURCE_VIEW,
      sourceSegment: { transactionId: txn.id },
    },
  }));
}

/** Rows filed exactly on categoryId (not subcategory descendants). */
export function directCategoryTransactions(
  txns: Transaction[],
  categoryId: string,
): Transaction[] {
  return txns.filter((txn) => resolvedCategoryId(txn) === categoryId);
}

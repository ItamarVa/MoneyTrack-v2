/**
 * Transaction kind options shared by the desktop column menu, the filter chips and the phone
 * filter sheet, so the three never disagree on order or wording. Copy lives in he.json.
 * Depends on: contracts types only. Used by: transaction-filters-bar, transaction-filter-sheet,
 * transaction-column-header-menu.
 */
import type { TransactionKind } from "@moneytrack/contracts";
import he from "@/locales/he.json";

export const KIND_LABELS: Record<TransactionKind, string> = he.transactionsUx.kinds;

export const KIND_OPTIONS: { value: TransactionKind; label: string }[] = (
  ["expense", "income", "transfer", "card_settlement", "refund", "loan_payment"] as const
).map((value) => ({ value, label: KIND_LABELS[value] }));

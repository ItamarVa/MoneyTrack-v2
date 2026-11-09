/**
 * The single decision point for a transaction's `kind`, shared by the live sync
 * and by the repair script so both can never drift apart.
 * Only bank rows are re-interpreted: on a card, a purchase is always a purchase.
 */
import type { TransactionKind } from "@moneytrack/contracts";
import { eq, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { looksLikeDepositStem, looksLikeLoanPayment, looksLikeSavingsMove } from "./savings.js";
import { looksLikeCardSettlement } from "./settlement.js";

export type KindInput = {
  accountKind: string;
  descriptionRaw: string;
  descriptionNormalized: string;
  /** Kind the scraper mapper produced, used when no bank rule applies. */
  fallbackKind: TransactionKind;
  /** Optional: deposit and loan stems apply to debits only. Unknown counts as debit. */
  direction?: "debit" | "credit";
};

export function resolveTransactionKind(input: KindInput): TransactionKind {
  if (input.accountKind !== "bank") {
    return input.fallbackKind;
  }

  const texts = [input.descriptionRaw, input.descriptionNormalized];
  if (texts.some(looksLikeSavingsMove)) {
    return "transfer";
  }
  if (texts.some(looksLikeCardSettlement)) {
    return "card_settlement";
  }
  if (input.direction === "credit") {
    return input.fallbackKind;
  }
  if (texts.some(looksLikeDepositStem)) {
    return "transfer";
  }
  if (texts.some(looksLikeLoanPayment)) {
    return "loan_payment";
  }
  return input.fallbackKind;
}

/**
 * Re-derives the kind of one stored row (same rule as the live sync) so rows that
 * predate a pattern change pick it up. Bank rows only; a hand-classified row keeps its kind.
 * Returns true when the row changed; the caller owns rollup invalidation.
 */
export function retagTransactionKind(
  db: MoneyTrackDb,
  txn: typeof transactions.$inferSelect,
  accountKind: string,
): boolean {
  if (accountKind !== "bank" || txn.classificationSource === "manual") {
    return false;
  }
  const kind = resolveTransactionKind({
    accountKind,
    descriptionRaw: txn.descriptionRaw,
    descriptionNormalized: txn.descriptionNormalized,
    fallbackKind: txn.kind === "refund" ? "refund" : txn.direction === "credit" ? "income" : "expense",
    direction: txn.direction === "credit" ? "credit" : "debit",
  });
  if (kind === txn.kind) {
    return false;
  }
  db.update(transactions)
    .set({ kind, updatedAt: new Date().toISOString() })
    .where(eq(transactions.id, txn.id))
    .run();
  return true;
}

/**
 * The single decision point for a transaction's `kind`, shared by the live sync
 * and by the repair script so both can never drift apart.
 * Only bank rows are re-interpreted: on a card, a purchase is always a purchase.
 */
import type { TransactionKind } from "@moneytrack/contracts";
import { looksLikeSavingsMove } from "./savings.js";
import { looksLikeCardSettlement } from "./settlement.js";

export type KindInput = {
  accountKind: string;
  descriptionRaw: string;
  descriptionNormalized: string;
  /** Kind the scraper mapper produced, used when no bank rule applies. */
  fallbackKind: TransactionKind;
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
  return input.fallbackKind;
}

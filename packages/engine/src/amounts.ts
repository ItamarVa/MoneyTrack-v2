import type { TransactionKind, TransactionDirection } from "@moneytrack/contracts";

type TxnSlice = {
  excludedFromTotals: boolean;
  kind: string;
  direction: string;
  amountIls: number;
};

export function expenseContribution(txn: TxnSlice): number {
  if (txn.excludedFromTotals) {
    return 0;
  }
  // A card_settlement still counts: for an issuer we do not scrape, the bank's
  // payment is the only record of that spend. `processCardSettlements` excludes
  // the ones whose itemised charges we already hold (MEM-DOMAIN).
  if (txn.kind === "expense" || txn.kind === "loan_payment" || txn.kind === "card_settlement") {
    return txn.direction === "debit" ? txn.amountIls : -txn.amountIls;
  }
  if (txn.kind === "refund") {
    return txn.direction === "credit" ? -txn.amountIls : txn.amountIls;
  }
  return 0;
}

export function incomeContribution(txn: TxnSlice): number {
  if (txn.excludedFromTotals) {
    return 0;
  }
  if (txn.kind === "income") {
    return txn.direction === "credit" ? txn.amountIls : -txn.amountIls;
  }
  return 0;
}

export function amountsMatch(a: number, b: number, toleranceIls = 2): boolean {
  return Math.abs(a - b) <= toleranceIls || Math.abs(a - b) <= Math.max(a, b) * 0.01;
}

export function signedKind(
  direction: TransactionDirection,
  kind: TransactionKind,
): TransactionKind {
  if (kind === "refund") {
    return "refund";
  }
  if (direction === "credit" && kind === "expense") {
    return "refund";
  }
  return kind;
}

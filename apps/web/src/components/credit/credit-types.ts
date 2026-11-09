/**
 * Client-safe shapes for the credit-card page. CreditSummaryResponse mirrors what
 * GET /api/credit/summary returns (engine `queryCreditCardCharges`); the route's
 * `satisfies` keeps the two from drifting. Never import @moneytrack/engine in a client file.
 */
export type CardChargeKind = "upcoming" | "last" | "none";

export type CardCharge = {
  kind: CardChargeKind;
  date: string | null;
  amountIls: number;
  transactionCount: number;
};

export type CreditCardCharges = {
  accountId: string;
  displayName: string;
  institutionCode: string;
  numberLast4: string | null;
  charge: CardCharge;
};

export type CreditSummaryResponse = { today: string; cards: CreditCardCharges[] };

/** Mirrors engine `ReconciliationMonth` (GET /api/credit/reconciliation). */
export type ReconciliationStatus = "match" | "mismatch" | "no_bill" | "open" | "no_details";

export type ReconciliationMonth = {
  month: string;
  billed: number | null;
  detailed: number;
  diff: number | null;
  status: ReconciliationStatus;
  combined: boolean;
  /** Bank debits counted as this charge's bill (signed), to explain a gap. */
  debits: { id: string; date: string; amount: number; description: string }[];
  /**
   * Other issuer debits in the charge window, left out of the bill (another card, transfers,
   * prepaid loads). Informational, never a problem. Optional only so older fixtures still type-check.
   */
  extras?: { id: string; date: string; amount: number; description: string }[];
};

export type CardReconciliationRow = {
  accountId: string;
  label: string;
  institutionCode: string;
  months: ReconciliationMonth[];
};

export type CreditReconciliationResponse = { from: string; to: string; today: string; cards: CardReconciliationRow[] };

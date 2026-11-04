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

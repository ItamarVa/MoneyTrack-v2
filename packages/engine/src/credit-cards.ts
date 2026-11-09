/**
 * Next-charge (the "next charge" card) figures for the credit-card page, one per credit_card account.
 * A card bills everything sharing one charge date in a single hit, so the next charge is the
 * earliest charge date on or after today, summed with the engine's own expense rules.
 * Gotcha: rows that contribute 0 (pending, not yet billed) never create a charge date.
 * Used by: apps/web GET /api/credit/summary.
 */
import { accounts, eq, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { expenseContribution } from "./amounts.js";

export type ChargeRow = {
  chargeDate: string;
  excludedFromTotals: boolean;
  kind: string;
  direction: string;
  amountIls: number;
};

/** upcoming = on/after today; last = newest before today; none = no billed rows at all. */
export type CardCharge = {
  kind: "upcoming" | "last" | "none";
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

const NO_CHARGE: CardCharge = { kind: "none", date: null, amountIls: 0, transactionCount: 0 };

function roundAgorot(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Pure: pick the next (else last) charge from one card's rows. `today` is YYYY-MM-DD. */
export function pickCardCharge(rows: readonly ChargeRow[], today: string): CardCharge {
  const byDate = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const contribution = expenseContribution(row);
    if (contribution === 0) {
      continue;
    }
    const bucket = byDate.get(row.chargeDate) ?? { total: 0, count: 0 };
    bucket.total += contribution;
    bucket.count += 1;
    byDate.set(row.chargeDate, bucket);
  }

  const dates = [...byDate.keys()].sort();
  const upcoming = dates.find((date) => date >= today);
  const chosen = upcoming ?? dates.filter((date) => date < today).at(-1);
  if (chosen === undefined) {
    return NO_CHARGE;
  }
  const bucket = byDate.get(chosen)!;
  return {
    kind: upcoming === undefined ? "last" : "upcoming",
    date: chosen,
    amountIls: roundAgorot(bucket.total),
    transactionCount: bucket.count,
  };
}

/** Household credit cards with their next charge. Business cards stay out (MEM-DATA). */
export function queryCreditCardCharges(db: MoneyTrackDb, today: string): CreditCardCharges[] {
  // ponytail: loads every row per card (a few thousand at most); bound by chargeDate if it grows.
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.kind, "credit_card"))
    .all()
    .filter((account) => account.scope === "household")
    .map((account) => ({
      accountId: account.id,
      displayName: account.displayName,
      institutionCode: account.institutionCode,
      numberLast4: account.numberLast4,
      charge: pickCardCharge(
        db.select().from(transactions).where(eq(transactions.accountId, account.id)).all(),
        today,
      ),
    }));
}

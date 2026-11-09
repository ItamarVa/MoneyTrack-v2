/**
 * Detects a recurring mortgage/loan payment from bank rows of kind `loan_payment`.
 * Why: a household can have monthly mortgage debits while no loan is entered, which
 * leaves net worth and the Loans page silently incomplete. Pure function + thin DB
 * reader. Gotchas: amounts are compared by absolute value; payments in one calendar
 * month are summed (one loan, several tracks); a merchant seen in only one month is a
 * one-off and is ignored. Used by apps/web `/api/loans/detected-payments` and net-worth.
 */
import { accounts, eq, merchants, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { roundToAgora } from "./amortization.js";
import { shiftMonths } from "./dates.js";

export type LoanPaymentRow = {
  merchant: string;
  amountIls: number;
  /** YYYY-MM-DD */
  date: string;
};

export type DetectedLoanPayment = {
  merchant: string;
  monthlyAmountIls: number;
  months: number;
  lastDate: string;
};

const DETECTION_WINDOW_MONTHS = 6;
const MIN_MONTHS = 2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function detectRecurringLoanPayments(
  rows: LoanPaymentRow[],
  today: string,
): DetectedLoanPayment[] {
  const windowStart = shiftMonths(today, -DETECTION_WINDOW_MONTHS);
  const byMerchant = new Map<string, { perMonth: Map<string, number>; lastDate: string }>();

  for (const row of rows) {
    if (row.date < windowStart || row.date > today) continue;
    const entry = byMerchant.get(row.merchant) ?? { perMonth: new Map(), lastDate: row.date };
    const month = row.date.slice(0, 7);
    entry.perMonth.set(month, (entry.perMonth.get(month) ?? 0) + Math.abs(row.amountIls));
    if (row.date > entry.lastDate) entry.lastDate = row.date;
    byMerchant.set(row.merchant, entry);
  }

  const result: DetectedLoanPayment[] = [];
  for (const [merchant, entry] of byMerchant) {
    if (entry.perMonth.size < MIN_MONTHS) continue;
    result.push({
      merchant,
      monthlyAmountIls: roundToAgora(median([...entry.perMonth.values()])),
      months: entry.perMonth.size,
      lastDate: entry.lastDate,
    });
  }
  return result.sort((a, b) => b.monthlyAmountIls - a.monthlyAmountIls);
}

/** Household `loan_payment` debits in the last `DETECTION_WINDOW_MONTHS` months, grouped. */
export function queryDetectedLoanPayments(db: MoneyTrackDb, today: string): DetectedLoanPayment[] {
  const scopeByAccount = new Map(
    db.select({ id: accounts.id, scope: accounts.scope }).from(accounts).all().map((a) => [a.id, a.scope]),
  );
  const names = new Map(
    db.select({ id: merchants.id, name: merchants.canonicalName }).from(merchants).all().map((m) => [m.id, m.name]),
  );
  const rows = db
    .select()
    .from(transactions)
    .where(eq(transactions.kind, "loan_payment"))
    .all()
    .filter(
      (row) =>
        row.direction === "debit" &&
        !row.excludedFromTotals &&
        scopeByAccount.get(row.accountId) === "household",
    )
    .map((row) => ({
      merchant: (row.merchantId ? names.get(row.merchantId) : undefined) ?? row.descriptionNormalized,
      amountIls: row.amountIls,
      date: row.transactionDate,
    }));
  return detectRecurringLoanPayments(rows, today);
}

/**
 * Pure per-account activity math for the accounts page cards.
 * Why: the page shows month in/out, count, last activity and a 6-month spend trend per account,
 * computed from the account's own transactions; keeping it pure keeps it unit-testable.
 * Gotchas: transactions flagged excludedFromTotals are ignored; a card's "spent" is debit minus
 * credit (refunds net out). Months are bucketed by transactionDate. Used by account-card.tsx.
 */
import type { Transaction } from "@moneytrack/contracts";
import { monthBoundsFor } from "@/lib/analysis-filter";

export const TREND_MONTHS = 6;

type TxSlice = Pick<Transaction, "transactionDate" | "direction" | "amountIls" | "excludedFromTotals">;

export type MonthTrendPoint = { period: string; out: number };

export type AccountSummary = {
  moneyIn: number;
  moneyOut: number;
  /** debit minus credit, never below zero in display terms is the caller's choice. */
  net: number;
  count: number;
  lastActivity: string | null;
  trend: MonthTrendPoint[];
};

function shiftMonthKey(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(year ?? 0, (month ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The TREND_MONTHS months ending at `endPeriod`, oldest first. */
export function trendPeriods(endPeriod: string): string[] {
  return Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonthKey(endPeriod, i - (TREND_MONTHS - 1)));
}

/** Inclusive date bounds covering the whole trend window. */
export function trendWindow(endPeriod: string): { dateFrom: string; dateTo: string } {
  const periods = trendPeriods(endPeriod);
  const [fy, fm] = periods[0]!.split("-").map(Number);
  const [ty, tm] = endPeriod.split("-").map(Number);
  return {
    dateFrom: monthBoundsFor(new Date(fy ?? 0, (fm ?? 1) - 1, 1)).dateFrom,
    dateTo: monthBoundsFor(new Date(ty ?? 0, (tm ?? 1) - 1, 1)).dateTo,
  };
}

/**
 * `endPeriod` is the selected month ("YYYY-MM"). With `wholeWindow` (the all-time period) the
 * in/out/count cover the entire trend window instead of the one month.
 */
export function summarizeAccount(
  txns: readonly TxSlice[],
  endPeriod: string,
  wholeWindow = false,
): AccountSummary {
  const periods = trendPeriods(endPeriod);
  const outByMonth = new Map(periods.map((p) => [p, 0]));
  let moneyIn = 0;
  let moneyOut = 0;
  let count = 0;
  let lastActivity: string | null = null;

  for (const tx of txns) {
    if (tx.excludedFromTotals) continue;
    const month = tx.transactionDate.slice(0, 7);
    if (!outByMonth.has(month)) continue;
    const signedOut = tx.direction === "debit" ? tx.amountIls : -tx.amountIls;
    outByMonth.set(month, (outByMonth.get(month) ?? 0) + signedOut);
    if (!wholeWindow && month !== endPeriod) continue;
    count += 1;
    if (tx.direction === "debit") moneyOut += tx.amountIls;
    else moneyIn += tx.amountIls;
    if (lastActivity === null || tx.transactionDate > lastActivity) lastActivity = tx.transactionDate;
  }

  return {
    moneyIn,
    moneyOut,
    net: moneyOut - moneyIn,
    count,
    lastActivity,
    trend: periods.map((period) => ({ period, out: Math.max(0, outByMonth.get(period) ?? 0) })),
  };
}

/** Bar heights in percent (0-100) for a trend; a nonzero month never renders below 8%. */
export function trendBarHeights(trend: readonly MonthTrendPoint[]): number[] {
  const max = Math.max(...trend.map((p) => p.out), 0);
  if (max <= 0) return trend.map(() => 0);
  return trend.map((p) => (p.out <= 0 ? 0 : Math.max(8, Math.round((p.out / max) * 100))));
}

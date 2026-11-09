/**
 * Pure helpers for the "bank charge vs. card details" section: which month window to ask for,
 * the selected month's line per card, and the recent months whose details are incomplete.
 * Client-safe, no React. Used by: credit-reconciliation.tsx.
 */
import type { CardReconciliationRow, ReconciliationMonth } from "./credit-types";

/** Card issuers whose rows come from statement-file uploads rather than a sync. */
export const STATEMENT_UPLOAD_ISSUERS: ReadonlySet<string> = new Set(["isracard", "amex"]);

const RECENT_MONTHS = 12;

export function shiftMonth(month: string, delta: number): string {
  const [year, mm] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mm - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const isMonth = (period: string): boolean => /^\d{4}-\d{2}$/.test(period);

/** Last 12 months up to today's month, stretched to include the selected month. */
export function reconciliationWindow(period: string, today: string): { from: string; to: string } {
  const current = today.slice(0, 7);
  let from = shiftMonth(current, -(RECENT_MONTHS - 1));
  let to = current;
  if (isMonth(period)) {
    if (period < from) from = period;
    if (period > to) to = period;
  }
  return { from, to };
}

export type CardMonth = { accountId: string; label: string; institutionCode: string; entry: ReconciliationMonth };

/** One line per selected card that has data for `period`. */
export function monthLines(rows: readonly CardReconciliationRow[], cardIds: readonly string[], period: string): CardMonth[] {
  return rows
    .filter((row) => cardIds.includes(row.accountId))
    .flatMap((row) => {
      const entry = row.months.find((month) => month.month === period);
      return entry ? [{ accountId: row.accountId, label: row.label, institutionCode: row.institutionCode, entry }] : [];
    });
}

/** Charged months (newest first, last 12 up to today) that need attention, `period` left out. */
export function recentProblems(
  rows: readonly CardReconciliationRow[],
  cardIds: readonly string[],
  period: string,
  today: string,
): CardMonth[] {
  const from = shiftMonth(today.slice(0, 7), -(RECENT_MONTHS - 1));
  return rows
    .filter((row) => cardIds.includes(row.accountId))
    .flatMap((row) =>
      row.months
        .filter((m) => (m.status === "mismatch" || m.status === "no_bill") && m.month >= from && m.month !== period)
        .map((entry) => ({ accountId: row.accountId, label: row.label, institutionCode: row.institutionCode, entry })),
    )
    .sort((a, b) => b.entry.month.localeCompare(a.entry.month) || a.label.localeCompare(b.label));
}

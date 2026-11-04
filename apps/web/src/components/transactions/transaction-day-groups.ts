/**
 * Day grouping for the phone transaction list: consecutive rows with the same transaction date
 * share a header showing the weekday, the date and that day's totals. Consecutive (not global)
 * grouping keeps the server's sort order and works across "load more" pages.
 * Totals use the same expense/income rules as the rest of the app (excluded rows count zero).
 * Used by: transaction-mobile-list.tsx.
 */
import type { Transaction } from "@moneytrack/contracts";
import { expenseContribution, incomeContribution } from "@/lib/transaction-amounts";

type DayRow = Pick<
  Transaction,
  "transactionDate" | "excludedFromTotals" | "kind" | "direction" | "amountIls" | "originalAmount" | "originalCurrency"
>;

export type DayGroup<T extends DayRow> = {
  date: string;
  rows: T[];
  expenseIls: number;
  incomeIls: number;
};

export function groupRowsByDay<T extends DayRow>(rows: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== row.transactionDate) {
      group = { date: row.transactionDate, rows: [], expenseIls: 0, incomeIls: 0 };
      groups.push(group);
    }
    group.rows.push(row);
    group.expenseIls += expenseContribution(row);
    group.incomeIls += incomeContribution(row);
  }
  return groups;
}

const dayFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

const dayYearFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Weekday, day and month; the year is added only when it is not the current one. */
export function formatDayLabel(isoDate: string, now: Date = new Date()): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year!, month! - 1, day);
  return (year === now.getFullYear() ? dayFormatter : dayYearFormatter).format(date);
}

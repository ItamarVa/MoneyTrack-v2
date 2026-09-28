/**
 * Monthly bars helpers: year-over-year alignment, summary deltas, and averages.
 * Aligns two twelve-month windows by calendar month for grouped bar comparison.
 */
import type { MonthlySeriesPoint } from "@moneytrack/contracts";
import type { YearOverYearRow } from "./types";

const SHORT_MONTHS = [
  "ינו",
  "פבר",
  "מרץ",
  "אפר",
  "מאי",
  "יונ",
  "יול",
  "אוג",
  "ספט",
  "אוק",
  "נוב",
  "דצמ",
] as const;

function parsePeriod(period: string): { year: number; month: number } {
  const [yearText, monthText] = period.split("-");
  return { year: Number(yearText), month: Number(monthText) };
}

function absExpense(value: number): number {
  return Math.abs(value);
}

export function alignYearOverYear(points: MonthlySeriesPoint[]): YearOverYearRow[] {
  const sorted = [...points].sort((left, right) => left.period.localeCompare(right.period));
  const byPeriod = new Map(sorted.map((point) => [point.period, point]));

  const currentYear = sorted.length > 0 ? parsePeriod(sorted[sorted.length - 1]!.period).year : new Date().getFullYear();
  const currentMonths = sorted.filter((point) => parsePeriod(point.period).year === currentYear);

  let runningYtd = 0;
  return currentMonths.map((current) => {
    const { month } = parsePeriod(current.period);
    const priorPeriod = `${currentYear - 1}-${String(month).padStart(2, "0")}`;
    const prior = byPeriod.get(priorPeriod);

    const currentExpenses = absExpense(current.expensesIls);
    runningYtd += currentExpenses;
    const priorExpenses = prior ? absExpense(prior.expensesIls) : null;
    let yoyExpensePct: number | null = null;
    if (priorExpenses != null && priorExpenses > 0) {
      yoyExpensePct = ((currentExpenses - priorExpenses) / priorExpenses) * 100;
    }

    return {
      month,
      monthLabel: SHORT_MONTHS[month - 1] ?? String(month),
      currentPeriod: current.period,
      priorPeriod: prior ? priorPeriod : null,
      currentExpenses,
      currentExpensesYtd: runningYtd,
      priorExpenses,
      currentIncome: Math.abs(current.incomeIls),
      priorIncome: prior ? Math.abs(prior.incomeIls) : null,
      currentNet: current.netIls,
      priorNet: prior?.netIls ?? null,
      yoyExpensePct,
    };
  });
}

export function hasPriorYearData(rows: YearOverYearRow[]): boolean {
  return rows.some((row) => row.priorExpenses != null);
}

export function computeTwelveMonthExpenseAverage(rows: YearOverYearRow[]): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, row) => sum + row.currentExpenses, 0);
  return total / rows.length;
}

export function computeYoYSummary(rows: YearOverYearRow[]): {
  pct: number | null;
  direction: "up" | "down" | "flat" | "unknown";
} {
  const currentTotal = rows.reduce((sum, row) => sum + row.currentExpenses, 0);
  const priorTotal = rows.reduce((sum, row) => sum + (row.priorExpenses ?? 0), 0);
  if (priorTotal <= 0 || !hasPriorYearData(rows)) {
    return { pct: null, direction: "unknown" };
  }
  const pct = ((currentTotal - priorTotal) / priorTotal) * 100;
  const direction = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, direction };
}

export function buildYoYSummaryLine(rows: YearOverYearRow[]): string {
  const summary = computeYoYSummary(rows);
  if (summary.pct == null) {
    return "אין עדיין נתונים לשנה קודמת";
  }
  const rounded = Math.abs(summary.pct) >= 10 ? summary.pct.toFixed(0) : summary.pct.toFixed(1);
  if (summary.direction === "flat") {
    return "סך ההוצאות ב-12 החודשים דומה לשנה שעברה";
  }
  const word = summary.direction === "up" ? "גבוה" : "נמוך";
  return `סך ההוצאות ב-12 החודשים ${word} ב-${rounded}% מאשתקד`;
}

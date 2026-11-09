/**
 * Dashboard helpers: month navigation and period-over-period change labels.
 * Used by the KPI strip and analysis donut (month shift until Track C migrates).
 *
 * The dashboard reads charge dates over whole months, so its numbers answer
 * "what leaves the account this month" — see monthBoundsFor in lib/analysis-filter.
 */
import type { AnalysisFilter, MonthlySeriesPoint } from "@moneytrack/contracts";
import type { CreditSummaryResponse } from "@/components/credit/credit-types";
import { monthBoundsFor } from "@/lib/analysis-filter";
import { formatIls } from "@/lib/currency";
import { formatMonthYear, formatShortDate } from "@/lib/dates";
import he from "@/locales/he.json";
import { compareToUsual, type UsualMonth } from "./usual-month";

export function shiftMonth(filter: AnalysisFilter, direction: -1 | 1): AnalysisFilter {
  const anchor = filter.dateFrom ?? filter.dateTo ?? new Date().toISOString().slice(0, 10);
  // Read the month off the string: `new Date("2026-09-01")` is UTC midnight and
  // lands in the previous month for negative UTC offsets.
  const [year, month] = anchor.split("-").map(Number);
  const shifted = new Date(year ?? 0, (month ?? 1) - 1 + direction, 1);
  return { ...filter, ...monthBoundsFor(shifted) };
}

export function formatPeriodChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${rounded}% לעומת חודש שעבר`;
}

export function savingsRate(net: number, income: number): number | null {
  return income > 0 ? (net / income) * 100 : null;
}

export function formatSavingsRate(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)}%`;
}

export type MonthDataState = "all" | "empty" | "partial" | "complete";

/**
 * Decides how the dashboard should treat the selected period.
 * - empty: a month with no income and no expenses (not synced yet, or the 1st);
 *   month-over-month deltas would be a meaningless -100%.
 * - partial: the current calendar month, still in progress, so comparing it with
 *   a whole previous month overstates any drop.
 * Net-zero months with real transactions are indistinguishable from empty here;
 * the dashboard payload has no transaction count (ponytail: add one to the API
 * if that ever matters).
 */
export function resolveMonthDataState(input: {
  period: string;
  currentPeriod: string;
  totalIncomeIls: number;
  totalExpensesIls: number;
}): MonthDataState {
  if (input.period === "all") return "all";
  if (input.totalIncomeIls === 0 && input.totalExpensesIls === 0) return "empty";
  if (input.period === input.currentPeriod) return "partial";
  return "complete";
}

/** Subtitle line for the all-period view; `firstPeriod` is the earliest "YYYY-MM" with data. */
export function allPeriodSummaryLine(firstPeriod: string | undefined): string {
  return firstPeriod
    ? he.allPeriod.sinceMonth.replace("{month}", formatMonthYear(firstPeriod))
    : he.allPeriod.sinceFallback;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/**
 * The one plain sentence on top of the dashboard for a single month, e.g.
 * "הוצאתם עד כה 4,200 ₪ החודש — 12% מעל חודש רגיל". The comparison is dropped when there is
 * no usual month to compare with.
 */
export function monthSummarySentence(input: {
  spentIls: number;
  periodLabel: string;
  inProgress: boolean;
  usualMonth: UsualMonth | null;
}): string {
  const text = he.homeUx.summary;
  const amount = formatIls(input.spentIls);
  const head = input.inProgress
    ? fill(text.spentSoFar, { amount })
    : fill(text.spentInMonth, { amount, month: input.periodLabel });
  const comparison = input.usualMonth ? compareToUsual(input.spentIls, input.usualMonth.medianIls) : null;
  if (!comparison) return head;
  const tail =
    comparison.direction === "same"
      ? text.same
      : fill(comparison.direction === "above" ? text.above : text.below, { pct: comparison.pct });
  return `${head} — ${tail}`;
}

/** Caption that explains what "חודש רגיל" means, in plain words. */
export function usualMonthNote(usualMonth: UsualMonth): string {
  const text = he.homeUx.summary;
  return fill(usualMonth.comparedThroughDay == null ? text.usualNote : text.usualNoteSoFar, {
    months: usualMonth.monthsUsed,
  });
}

/** All-period sentence: "ממוצע חודשי X ₪ ב-N חודשים", over months that had expenses. */
export function allHistorySentence(series: MonthlySeriesPoint[]): string | null {
  const months = series.filter((row) => row.expensesIls > 0);
  if (months.length === 0) return null;
  const total = months.reduce((sum, row) => sum + row.expensesIls, 0);
  const amount = formatIls(total / months.length);
  return months.length === 1
    ? fill(he.homeUx.summary.allAverageOne, { amount })
    : fill(he.homeUx.summary.allAverage, { amount, months: months.length });
}

export type NextCardCharge = { date: string; amountIls: number };

/**
 * The next card bill: the earliest upcoming charge date, summing the cards that bill on that
 * same day (a household's cards usually share one billing date). Null when none is upcoming.
 */
export function nextCardCharge(summary: CreditSummaryResponse): NextCardCharge | null {
  const upcoming = summary.cards.filter(
    (card) => card.charge.kind === "upcoming" && card.charge.date != null,
  );
  const date = upcoming.map((card) => card.charge.date!).sort()[0];
  if (!date) return null;
  const amountIls = upcoming
    .filter((card) => card.charge.date === date)
    .reduce((sum, card) => sum + card.charge.amountIls, 0);
  return { date, amountIls };
}

export function nextCardChargeSentence(charge: NextCardCharge): string {
  return fill(he.homeUx.summary.nextCharge, {
    amount: formatIls(charge.amountIls),
    date: formatShortDate(charge.date),
  });
}

/** "2026-11-05" -> "5/11": short enough for a phone chart axis (no year, no month name). */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}/${month}`;
}

/** At most `max` evenly spaced labels, always keeping the first and last, so axis ticks never overlap. */
export function pickAxisTicks(labels: string[], max: number): string[] {
  if (labels.length <= max) return labels;
  const picked: string[] = [];
  for (let slot = 0; slot < max; slot += 1) {
    picked.push(labels[Math.round((slot * (labels.length - 1)) / (max - 1))]!);
  }
  return [...new Set(picked)];
}

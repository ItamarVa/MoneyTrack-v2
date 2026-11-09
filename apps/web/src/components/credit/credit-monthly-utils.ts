/**
 * Pure data shaping for the credit page's 12-month stacked chart: the month window (own 12-month window: default = latest data month, paged by 12, kept around the selection),
 * leaf -> top-level roll-up (category mode only; person/card use `rollUp=false`), top-5 + "other", and month-over-month change.
 * Kept free of React/fetch so every rule is unit-tested (credit-monthly-utils.test.ts).
 * Used by: credit-monthly-chart. Series keys are category ids, plus two reserved keys.
 */
import type { Category, TrendPoint } from "@moneytrack/contracts";

export const OTHER_KEY = "other";
export const UNCATEGORIZED_KEY = "uncategorized";
export const WINDOW_MONTHS = 12;
export const TOP_CATEGORIES = 5;

export type MonthWindow = { months: string[]; dateFrom: string; dateTo: string };

export type MonthlySeries = { key: string; name: string; isOther: boolean };

/** One bar: `values` holds the amount per series key (absent = 0). */
export type MonthlyRow = { period: string; values: Record<string, number>; total: number };

export type MonthlyData = { series: MonthlySeries[]; rows: MonthlyRow[] };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `period` ("YYYY-MM") moved by `delta` months; correct across year boundaries. */
export function shiftMonth(period: string, delta: number): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`;
}

/** The 12 months ending at `end`, with the inclusive date range covering them. */
export function windowEndingAt(end: string): MonthWindow {
  const months: string[] = [];
  for (let offset = WINDOW_MONTHS - 1; offset >= 0; offset -= 1) months.push(shiftMonth(end, -offset));
  const [year = 0, month = 1] = end.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { months, dateFrom: `${months[0]}-01`, dateTo: `${end}-${pad(lastDay)}` };
}

/** Last month (lexicographic = chronological for YYYY-MM) with a non-zero segment; null when none. */
export function latestDataPeriod(points: readonly TrendPoint[]): string | null {
  let latest: string | null = null;
  for (const point of points) {
    if (!point.segments.some((segment) => segment.amountIls !== 0)) continue;
    if (latest === null || point.period > latest) latest = point.period;
  }
  return latest;
}

/** Window end after paging: a full year back (-1) or forward (+1). */
export function pageWindowEnd(end: string, direction: -1 | 1): string {
  return shiftMonth(end, direction * WINDOW_MONTHS);
}

/** Forward paging stops once the window already contains the latest data month. */
export function canPageForward(end: string, latest: string | null): boolean {
  return latest !== null && end < latest;
}

/** Minimal shift so `selected` is inside the window ending at `end`; unchanged when already inside. */
export function keepSelectedVisible(end: string, selected: string): string {
  if (selected > end) return selected;
  const start = shiftMonth(end, -(WINDOW_MONTHS - 1));
  return selected < start ? shiftMonth(selected, WINDOW_MONTHS - 1) : end;
}

/** Id of the top-level ancestor; an unknown id is treated as its own top level. */
function topLevelId(categoryId: string, parentById: ReadonlyMap<string, string | null>): string {
  let current = categoryId;
  for (let hops = 0; hops < 10; hops += 1) {
    const parent = parentById.get(current);
    if (!parent) return current;
    current = parent;
  }
  return current;
}

export function buildMonthlyData(
  points: readonly TrendPoint[],
  categories: readonly Category[],
  months: readonly string[],
  rollUp = true,
): MonthlyData {
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  const nameById = new Map(categories.map((category) => [category.id, category.name]));
  const names = new Map<string, string>();
  const perMonth = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();

  for (const point of points) {
    if (!months.includes(point.period)) continue;
    const bucket = perMonth.get(point.period) ?? new Map<string, number>();
    perMonth.set(point.period, bucket);
    for (const segment of point.segments) {
      const key =
        segment.categoryId === null
          ? UNCATEGORIZED_KEY
          : rollUp
            ? topLevelId(segment.categoryId, parentById)
            : segment.categoryId;
      if (!names.has(key)) {
        names.set(
          key,
          segment.categoryId === null || !rollUp ? segment.categoryName : (nameById.get(key) ?? segment.categoryName),
        );
      }
      bucket.set(key, (bucket.get(key) ?? 0) + segment.amountIls);
      totals.set(key, (totals.get(key) ?? 0) + segment.amountIls);
    }
  }

  const top = [...totals.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? "").localeCompare(names.get(b[0]) ?? "", "he"))
    .slice(0, TOP_CATEGORIES)
    .map(([key]) => key);
  const topSet = new Set(top);

  const rows = months.map((period): MonthlyRow => {
    const values: Record<string, number> = {};
    let total = 0;
    for (const [key, amount] of perMonth.get(period) ?? []) {
      const target = topSet.has(key) ? key : OTHER_KEY;
      values[target] = (values[target] ?? 0) + amount;
      total += amount;
    }
    return { period, values, total: Math.round(total * 100) / 100 };
  });

  const series: MonthlySeries[] = top.map((key) => ({ key, name: names.get(key) ?? key, isOther: false }));
  if (rows.some((row) => (row.values[OTHER_KEY] ?? 0) !== 0)) {
    series.push({ key: OTHER_KEY, name: "", isOther: true });
  }
  return { series, rows };
}

/** Whole-percent change vs the previous month; null when there is no positive base. */
export function monthOverMonthPct(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Period of the chart column under a click/tap. Prefers the index (unambiguous), falls back to the category label; null when neither maps to a month. */
export function periodFromChartClick(
  months: readonly string[],
  state: { activeTooltipIndex?: number | string | null; activeLabel?: number | string | null } | null | undefined,
): string | null {
  const index = Number(state?.activeTooltipIndex);
  if (state?.activeTooltipIndex != null && Number.isInteger(index) && months[index] !== undefined) return months[index]!;
  const label = state?.activeLabel;
  return label != null && months.includes(String(label)) ? String(label) : null;
}

/**
 * "Usual month" maths for the dashboard summary card: the median of the previous
 * full months' expenses, and how far the selected month sits from it.
 * Pure (no db, no React) so the dashboard/home route and its tests share one definition.
 * Median, not mean: one holiday or car-repair month must not move the baseline.
 */

/** Previous months looked at; fewer than MIN_USUAL_MONTHS with data means no baseline. */
export const USUAL_MONTH_WINDOW = 6;
export const MIN_USUAL_MONTHS = 2;

export type UsualMonth = {
  /** Median expenses of the previous months that had expenses. */
  medianIls: number;
  monthsUsed: number;
  /**
   * Set when the selected month is still in progress: the median then covers the first
   * N days of each earlier month, so the comparison is like for like.
   */
  comparedThroughDay: number | null;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The `count` calendar months before `anchor` ("YYYY-MM"), newest first. */
export function previousPeriods(anchor: string, count: number = USUAL_MONTH_WINDOW): string[] {
  const [year, month] = anchor.split("-").map(Number);
  const periods: string[] = [];
  for (let step = 1; step <= count; step += 1) {
    const date = new Date(year!, month! - 1 - step, 1);
    periods.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return periods;
}

export function buildUsualMonth(
  amounts: number[],
  comparedThroughDay: number | null,
): UsualMonth | null {
  if (amounts.length < MIN_USUAL_MONTHS) return null;
  const medianIls = median(amounts);
  if (medianIls == null || medianIls <= 0) return null;
  return { medianIls, monthsUsed: amounts.length, comparedThroughDay };
}

export type UsualComparison = { direction: "above" | "below" | "same"; pct: number };

/** Whole-percent distance from the usual month; under half a percent reads as "same". */
export function compareToUsual(spentIls: number, usualIls: number): UsualComparison | null {
  if (!(usualIls > 0) || !Number.isFinite(spentIls)) return null;
  const pct = Math.round(Math.abs((spentIls - usualIls) / usualIls) * 100);
  if (pct === 0) return { direction: "same", pct: 0 };
  return { direction: spentIls > usualIls ? "above" : "below", pct };
}

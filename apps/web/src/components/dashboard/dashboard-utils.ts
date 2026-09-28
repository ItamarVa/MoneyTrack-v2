/**
 * Dashboard helpers: month navigation and period-over-period change labels.
 * Used by the KPI strip and analysis donut (month shift until Track C migrates).
 *
 * The dashboard reads charge dates over whole months, so its numbers answer
 * "what leaves the account this month" — see monthBoundsFor in lib/analysis-filter.
 */
import type { AnalysisFilter } from "@moneytrack/contracts";
import { monthBoundsFor } from "@/lib/analysis-filter";

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

/**
 * Decides when /transactions offers "results exist in other months" for an empty searched period.
 * Why: search is scoped to the header period, so a text hit in another charge month looks like "no results".
 * Invariant: probe only when a search is active, the period is bounded, and the current period has 0 rows.
 * Used by: transactions-page-client.tsx.
 */
import type { AnalysisFilter } from "@moneytrack/contracts";

/** Probe page size; the list API may omit `total`, so we count items and show "N+" when capped. */
export const PROBE_LIMIT = 200;

export function shouldProbeAllPeriod(input: {
  freeText?: string;
  allPeriod: boolean;
  loading: boolean;
  resultCount: number;
}): boolean {
  return Boolean(input.freeText?.trim()) && !input.allPeriod && !input.loading && input.resultCount === 0;
}

export function withoutDateBounds(filter: AnalysisFilter): AnalysisFilter {
  const { dateFrom: _from, dateTo: _to, ...rest } = filter;
  return rest;
}

/** Count label for the notice, or null when the probe found nothing. */
export function otherMonthsCountLabel(itemCount: number, hasMore: boolean, total?: number): string | null {
  const count = total ?? itemCount;
  if (count <= 0) return null;
  return total === undefined && hasMore ? `${count}+` : String(count);
}

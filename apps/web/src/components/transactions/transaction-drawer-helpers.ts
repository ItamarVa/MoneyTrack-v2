/**
 * Pure helpers for the transaction detail drawer: dirty-state diffs, the single-row-split rule,
 * category-list freshness, and ranking of link suggestions.
 * Kept free of React so the rules are unit-testable. Used by transaction-detail-drawer.tsx and
 * its drawer-*.tsx subcomponents.
 */
import type { Category, Transaction } from "@moneytrack/contracts";

export type MetaState = {
  note: string;
  tagIds: string[];
  excluded: boolean;
  reason: string;
};

function normalizeMeta(state: MetaState): string {
  return JSON.stringify({
    note: state.note.trim(),
    tagIds: [...state.tagIds].sort(),
    excluded: state.excluded,
    // The reason is only sent while excluded, so editing it otherwise is not a change.
    reason: state.excluded ? state.reason.trim() : "",
  });
}

export function isMetaDirty(current: MetaState, baseline: MetaState): boolean {
  return normalizeMeta(current) !== normalizeMeta(baseline);
}

export type SplitRow = { categoryId: string; amount: string; note: string; original?: number };

function splitSignature(rows: SplitRow[]): string {
  return JSON.stringify(
    rows.map((row) => [row.categoryId, row.amount.trim(), row.note.trim()]),
  );
}

export function isSplitDirty(current: SplitRow[], baseline: SplitRow[]): boolean {
  return splitSignature(current) !== splitSignature(baseline);
}

/** One filled row that covers the whole amount is a plain category change, not a split. */
export function isSingleFullSplit(rows: SplitRow[], totalAmount: number): boolean {
  const filled = rows.filter((row) => row.categoryId && row.amount);
  if (filled.length !== 1) return false;
  const only = filled[0];
  if (!only) return false;
  const value = only.original !== undefined && only.amount === only.original.toFixed(2)
    ? only.original
    : Number(only.amount);
  return Math.abs(value - Math.abs(totalAmount)) < 0.005;
}

/** Freshly fetched categories win; the page-level list is only a fallback until they arrive. */
export function pickCategories(
  fetched: Category[] | null,
  fromProps: Category[] | undefined,
): Category[] {
  return fetched ?? fromProps ?? [];
}

const DAY_MS = 86_400_000;

export function dayDistance(isoA: string, isoB: string): number {
  const toUtc = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.abs(Math.round((toUtc(isoA) - toUtc(isoB)) / DAY_MS));
}

export const LINK_WINDOW_DAYS = 60;

/**
 * Orders candidates: same absolute amount within the window first (closest date first), then the
 * rest by closeness of date. Drops the transaction itself and anything in `excludeIds`.
 */
export function rankLinkSuggestions(
  candidates: Transaction[],
  base: { id: string; amountIls: number; transactionDate: string },
  excludeIds: ReadonlySet<string> = new Set(),
): Transaction[] {
  const target = Math.abs(base.amountIls);
  const seen = new Set<string>();
  const scored: { row: Transaction; tier: number; distance: number }[] = [];
  for (const row of candidates) {
    if (row.id === base.id || excludeIds.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    const distance = dayDistance(row.transactionDate, base.transactionDate);
    const exact = Math.abs(Math.abs(row.amountIls) - target) < 0.005;
    scored.push({ row, tier: exact && distance <= LINK_WINDOW_DAYS ? 0 : 1, distance });
  }
  scored.sort((a, b) => a.tier - b.tier || a.distance - b.distance);
  return scored.map((item) => item.row);
}

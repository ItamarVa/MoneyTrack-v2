/**
 * Draft state of the phone filter sheet and its mapping onto the shared list-filter updates.
 * The sheet edits a local draft and applies it in one go; applying produces the SAME update shape
 * the desktop column menus emit, so both end up in the same URL params (see list-query).
 * Gotcha: source ids are split into accountIds/cardIds by splitSourceIds, as on desktop.
 * Used by: transaction-filter-sheet.tsx, transaction-column-header-menu.tsx (parseAmountBound).
 */
import type { AnalysisFilter, TransactionKind } from "@moneytrack/contracts";
import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";
import { selectedSourceIds, splitSourceIds, type SourceOption } from "@/lib/transaction-source";
import type { ListFilterUpdates } from "./transaction-list-query";

export type FilterSheetDraft = {
  freeText: string;
  categoryIds: string[];
  sourceIds: string[];
  kinds: TransactionKind[];
  amountMin: string;
  amountMax: string;
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
};

export function draftFromList(args: {
  filter: AnalysisFilter;
  kinds?: TransactionKind[];
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
}): FilterSheetDraft {
  const { filter } = args;
  return {
    freeText: filter.freeText ?? "",
    categoryIds: filter.categoryIds ?? [],
    sourceIds: selectedSourceIds(filter),
    kinds: args.kinds ?? [],
    amountMin: filter.amountMin !== undefined ? String(filter.amountMin) : "",
    amountMax: filter.amountMax !== undefined ? String(filter.amountMax) : "",
    sortBy: args.sortBy,
    sortDir: args.sortDir,
  };
}

/** Empty or non-numeric text means "no bound". Shared with the desktop amount menu. */
export function parseAmountBound(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function draftToUpdates(
  draft: FilterSheetDraft,
  sources: SourceOption[],
): { updates: ListFilterUpdates; sortBy: TransactionSortBy; sortDir: TransactionSortDir } {
  return {
    updates: {
      filter: {
        categoryIds: draft.categoryIds.length ? draft.categoryIds : undefined,
        ...splitSourceIds(draft.sourceIds, sources),
        amountMin: parseAmountBound(draft.amountMin),
        amountMax: parseAmountBound(draft.amountMax),
      },
      kinds: draft.kinds.length ? draft.kinds : undefined,
      freeText: draft.freeText.trim() || undefined,
    },
    sortBy: draft.sortBy,
    sortDir: draft.sortDir,
  };
}

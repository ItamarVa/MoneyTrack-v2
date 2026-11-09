/**
 * Pure list-filter state helpers behind the transactions page: how a filter update (from a chip,
 * a desktop column menu or the phone filter sheet) merges into the current state, and how that
 * state becomes URL params. One model for every surface; the URL stays the single source of truth.
 * Gotcha: a key that is PRESENT with value `undefined` means "clear it" (checked with `in`);
 * an absent key means "leave it". Treating undefined as absent made the last kind chip and the
 * search chip impossible to remove.
 * Used by: transactions-page-client.tsx, transaction-filter-sheet-draft.ts.
 */
import type { AnalysisFilter, TransactionKind } from "@moneytrack/contracts";
import { filterToSearchParams, type TransactionSortBy, type TransactionSortDir } from "@/lib/analysis-filter";

export type ListFilterUpdates = {
  filter?: Partial<AnalysisFilter>;
  kinds?: TransactionKind[];
  freeText?: string;
};

export type ListState = { filter: AnalysisFilter; kinds?: TransactionKind[] };

export function mergeListUpdates(current: ListState, updates: ListFilterUpdates): ListState {
  const filter: AnalysisFilter = { ...current.filter, ...updates.filter };
  if ("freeText" in updates) filter.freeText = updates.freeText;
  const kinds = "kinds" in updates ? updates.kinds : current.kinds;
  return { filter, kinds };
}

/** Everything the chips above the list can show, cleared at once. Period is global and stays. */
export function clearAllUpdates(): ListFilterUpdates {
  return {
    filter: {
      categoryIds: undefined,
      merchantIds: undefined,
      personIds: undefined,
      cardIds: undefined,
      accountIds: undefined,
      tagIds: undefined,
      salaryScope: undefined,
      amountMin: undefined,
      amountMax: undefined,
    },
    kinds: undefined,
    freeText: undefined,
  };
}

export function listQueryString(args: {
  filter: AnalysisFilter;
  kinds?: TransactionKind[];
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
  allPeriod: boolean;
  highlight?: string | null;
}): string {
  const params = filterToSearchParams(args.filter, { kinds: args.kinds });
  params.set("sortBy", args.sortBy);
  params.set("sortDir", args.sortDir);
  if (args.allPeriod) {
    params.delete("dateFrom");
    params.delete("dateTo");
    params.set("period", "all");
  } else {
    params.delete("period");
  }
  if (args.highlight) params.set("highlight", args.highlight);
  return params.toString();
}

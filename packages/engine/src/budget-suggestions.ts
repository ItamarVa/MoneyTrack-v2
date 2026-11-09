/**
 * Suggested monthly budgets: average spend of the last 3 full months per top-level category.
 * Pure computation over rollup rows (transaction basis); the API route does the loading.
 * Gotchas: rows are rolled up to the top-level parent, system / non-spend buckets are dropped
 * at the leaf BEFORE rolling up (loans 043 is a child of a spend parent), and the average is
 * divided by the window size, not by the months that had spend. Depends on: labels.ts.
 * Used by: apps/web /api/budgets/suggestions.
 */
import { UNCATEGORIZED_CATEGORY_ID } from "./labels.js";

/** Ids mirror @moneytrack/classify SYSTEM_CATEGORY_IDS plus their seeded parents (engine does not import classify). */
const NON_SPEND_CATEGORY_IDS = new Set([
  UNCATEGORIZED_CATEGORY_ID,
  "00000000-0000-4000-8000-0000000000b0", // savings group
  "00000000-0000-4000-8000-0000000000b1", // savings
  "00000000-0000-4000-8000-0000000000c0", // income / transfers group
  "00000000-0000-4000-8000-0000000000c1", // income
  "00000000-0000-4000-8000-0000000000c2", // internal transfers
  "00000000-0000-4000-8000-0000000000c3", // card bills of unconnected cards
  "00000000-0000-4000-8000-000000000043", // loans & mortgage
  "00000000-0000-4000-8000-0000000000d0", // taxes & fees
]);

export const BUDGET_SUGGESTION_MONTHS = 3;
export const BUDGET_SUGGESTION_MIN_ACTIVE_MONTHS = 2;
const ROUND_STEP_ILS = 50;

export type SuggestionRollupRow = {
  period: string;
  categoryId: string | null;
  /** Net expense for the row: positive = spend. */
  amountIls: number;
};

export type SuggestionCategory = { id: string; parentId: string | null; name: string };

export type BudgetSuggestion = {
  categoryId: string;
  categoryName: string;
  averageIls: number;
  suggestedIls: number;
  activeMonths: number;
};

/** The `count` full calendar months before `now`, oldest first (YYYY-MM). */
export function lastFullMonths(now: Date, count = BUDGET_SUGGESTION_MONTHS): string[] {
  const months: string[] = [];
  for (let back = count; back >= 1; back -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Round up to the nearest 50 ILS; tolerates float noise so 300.0000001 stays 300. */
export function roundUpToStep(amount: number, step = ROUND_STEP_ILS): number {
  return Math.ceil(Math.round(amount * 100) / 100 / step) * step;
}

export function suggestBudgets(input: {
  rows: readonly SuggestionRollupRow[];
  categories: readonly SuggestionCategory[];
  months: readonly string[];
}): BudgetSuggestion[] {
  const byId = new Map(input.categories.map((row) => [row.id, row] as const));
  const windowMonths = new Set(input.months);
  const perCategory = new Map<string, Map<string, number>>();

  for (const row of input.rows) {
    if (!windowMonths.has(row.period) || !row.categoryId) continue;
    if (NON_SPEND_CATEGORY_IDS.has(row.categoryId)) continue;
    const leaf = byId.get(row.categoryId);
    if (!leaf) continue;
    const topId = leaf.parentId ?? leaf.id;
    if (NON_SPEND_CATEGORY_IDS.has(topId)) continue;
    const months = perCategory.get(topId) ?? new Map<string, number>();
    months.set(row.period, (months.get(row.period) ?? 0) + row.amountIls);
    perCategory.set(topId, months);
  }

  const suggestions: BudgetSuggestion[] = [];
  for (const [topId, months] of perCategory) {
    let total = 0;
    let activeMonths = 0;
    for (const amount of months.values()) {
      if (amount > 0) {
        total += amount;
        activeMonths += 1;
      }
    }
    if (activeMonths < BUDGET_SUGGESTION_MIN_ACTIVE_MONTHS) continue;
    const averageIls = total / input.months.length;
    suggestions.push({
      categoryId: topId,
      categoryName: byId.get(topId)?.name ?? "",
      averageIls,
      suggestedIls: roundUpToStep(averageIls),
      activeMonths,
    });
  }
  return suggestions.sort((a, b) => b.suggestedIls - a.suggestedIls);
}

/** Seeded "לא מסווג" category — keep in sync with packages/db/drizzle/0002_seed_categories.sql */
import type { BreakdownDimension } from "@moneytrack/contracts";

type CategorySliceDimension = BreakdownDimension | "transaction";

export const UNCATEGORIZED_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

/** Drill-down filter for a category breakdown row (never drops uncategorized). */
export function drillDownCategoryIds(categoryId: string | null): string[] {
  return [categoryId ?? UNCATEGORIZED_CATEGORY_ID];
}

/** Entity page id for a donut slice; uncategorized maps to the seeded bucket. */
export function entityIdForCategorySlice(
  dimension: CategorySliceDimension,
  categoryId: string | null,
): string | null {
  if (categoryId) {
    return categoryId;
  }
  if (dimension === "category" || dimension === "subcategory") {
    return UNCATEGORIZED_CATEGORY_ID;
  }
  return null;
}

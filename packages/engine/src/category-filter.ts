/**
 * Shared category-id filtering for analysis queries and transaction lists.
 * The uncategorized bucket includes both the seeded category row and null category_id.
 */
import { inArray, isNull, or, transactions } from "@moneytrack/db";
import { UNCATEGORIZED_CATEGORY_ID } from "./labels.js";

export function categoryIdsMatchCondition(
  scopedCategoryIds: string[],
): ReturnType<typeof inArray> | ReturnType<typeof or> {
  if (scopedCategoryIds.includes(UNCATEGORIZED_CATEGORY_ID)) {
    return or(inArray(transactions.categoryId, scopedCategoryIds), isNull(transactions.categoryId));
  }
  return inArray(transactions.categoryId, scopedCategoryIds);
}

import { describe, expect, it } from "vitest";
import {
  UNCATEGORIZED_CATEGORY_ID,
  drillDownCategoryIds,
  entityIdForCategorySlice,
} from "./category-ids";

describe("category-ids", () => {
  it("maps null drill-down to the seeded uncategorized bucket", () => {
    expect(drillDownCategoryIds(null)).toEqual([UNCATEGORIZED_CATEGORY_ID]);
  });

  it("preserves explicit category ids", () => {
    const foodId = "11111111-1111-4111-8111-111111111111";
    expect(drillDownCategoryIds(foodId)).toEqual([foodId]);
  });

  it("maps uncategorized slices to the entity page id", () => {
    expect(entityIdForCategorySlice("category", null)).toBe(UNCATEGORIZED_CATEGORY_ID);
    expect(entityIdForCategorySlice("subcategory", null)).toBe(UNCATEGORIZED_CATEGORY_ID);
    expect(entityIdForCategorySlice("merchant", null)).toBeNull();
  });
});

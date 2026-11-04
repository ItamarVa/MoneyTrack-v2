import { describe, expect, it } from "vitest";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import {
  countAttention,
  providerCategoryIds,
  rootCategoryIds,
  suggestCategoryIds,
  topUsedCategoryIds,
} from "./attention-logic";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("topUsedCategoryIds", () => {
  it("orders by count desc, breaks ties by id, drops null", () => {
    const rows = [
      { categoryId: id(2), transactionCount: 5 },
      { categoryId: null, transactionCount: 99 },
      { categoryId: id(3), transactionCount: 9 },
      { categoryId: id(1), transactionCount: 5 },
    ];
    expect(topUsedCategoryIds(rows)).toEqual([id(3), id(1), id(2)]);
  });
});

describe("providerCategoryIds", () => {
  it("maps labels in order and skips unmapped ones", () => {
    const map = [
      { providerCategory: "A", categoryId: id(1) },
      { providerCategory: "B", categoryId: null },
      { providerCategory: "C", categoryId: id(3) },
    ];
    expect(providerCategoryIds({ providerCategories: ["C", "B", "A", "Z"] }, map)).toEqual([id(3), id(1)]);
  });
});

describe("suggestCategoryIds", () => {
  const known = new Set([id(1), id(2), id(3), id(4), id(5), id(6), UNCATEGORIZED_CATEGORY_ID]);

  it("puts provider categories first, then top used, deduped, capped at 4", () => {
    const out = suggestCategoryIds({
      providerIds: [id(3)],
      topUsedIds: [id(1), id(3), id(2), id(4), id(5)],
      knownIds: known,
    });
    expect(out).toEqual([id(3), id(1), id(2), id(4)]);
  });

  it("skips uncategorized, system buckets and unknown ids", () => {
    const cardBill = "00000000-0000-4000-8000-0000000000c3";
    const out = suggestCategoryIds({
      providerIds: [UNCATEGORIZED_CATEGORY_ID, id(99)],
      topUsedIds: [cardBill, id(2)],
      knownIds: new Set([...known, cardBill]),
    });
    expect(out).toEqual([id(2)]);
  });

  it("returns nothing when nothing qualifies", () => {
    expect(suggestCategoryIds({ providerIds: [], topUsedIds: [], knownIds: known })).toEqual([]);
  });
});

describe("countAttention", () => {
  const connection = (n: number, over = {}) => ({
    id: id(n),
    providerCode: "isracard",
    enabled: true,
    lastSuccessAt: "2026-11-01T00:00:00.000Z",
    credentialsSet: true,
    ...over,
  });

  it("is zero when nothing needs attention", () => {
    expect(countAttention({ connections: [connection(1)], states: [], merchants: [], alerts: [] })).toBe(0);
  });

  it("sums sync problems, merchants and non-dismissed alerts", () => {
    const total = countAttention({
      connections: [connection(1, { credentialsSet: false }), connection(2), connection(3, { enabled: false })],
      states: [],
      merchants: [{}, {}, {}],
      alerts: [{ status: "open" }, { status: "acknowledged" }, { status: "dismissed" }],
    });
    expect(total).toBe(1 + 3 + 2);
  });

  it("ignores a connection that is syncing right now", () => {
    const states = [
      { connectionId: id(1), providerCode: "isracard", live: true, otpRequired: false, failure: null },
    ];
    expect(
      countAttention({ connections: [connection(1, { credentialsSet: false })], states, merchants: [], alerts: [] }),
    ).toBe(0);
  });
});

describe("suggestions from the real breakdown response shape", () => {
  // Shape of POST /api/analysis/breakdown items (dimension "category": top-level parents), synthetic values.
  const items = [
    { categoryId: "00000000-0000-4000-8000-0000000000c3", categoryName: "card bill", amountIls: 900, transactionCount: 22, drillDown: {} },
    { categoryId: id(1), categoryName: "groceries", amountIls: 4000, transactionCount: 162, drillDown: {} },
    { categoryId: UNCATEGORIZED_CATEGORY_ID, categoryName: "uncategorized", amountIls: 700, transactionCount: 73, drillDown: {} },
    { categoryId: id(2), categoryName: "leisure", amountIls: 800, transactionCount: 70, drillDown: {} },
    { categoryId: id(3), categoryName: "home", amountIls: 3000, transactionCount: 84, drillDown: {} },
    { categoryId: id(4), categoryName: "health", amountIls: 600, transactionCount: 56, drillDown: {} },
    { categoryId: id(5), categoryName: "fun", amountIls: 500, transactionCount: 66, drillDown: {} },
  ];
  const categories = [
    ...items.map((item, n) => ({ id: item.categoryId, parentId: null, name: item.categoryName, sortOrder: n })),
    { id: id(9), parentId: id(1), name: "child", sortOrder: 0 },
  ];

  it("always gives four chips for a merchant with no provider category", () => {
    const out = suggestCategoryIds({
      providerIds: providerCategoryIds({ providerCategories: [] }, []),
      topUsedIds: topUsedCategoryIds(items),
      fallbackIds: rootCategoryIds(categories),
      knownIds: new Set(categories.map((c) => c.id)),
    });
    expect(out).toEqual([id(1), id(3), id(2), id(5)]);
  });

  it("falls back to top-level categories when usage data is missing", () => {
    const out = suggestCategoryIds({
      providerIds: [],
      topUsedIds: [],
      fallbackIds: rootCategoryIds(categories),
      knownIds: new Set(categories.map((c) => c.id)),
    });
    expect(out).toEqual([id(1), id(2), id(3), id(4)]);
  });
});

import { describe, expect, it } from "vitest";
import { lastFullMonths, roundUpToStep, suggestBudgets } from "./budget-suggestions.js";
import { UNCATEGORIZED_CATEGORY_ID } from "./labels.js";

// Synthetic data only.
const FOOD = "cat-food";
const GROCERIES = "cat-food-groceries";
const FUN = "cat-fun";
const HOUSING = "00000000-0000-4000-8000-000000000040";
const LOANS = "00000000-0000-4000-8000-000000000043";
const CARD_BILL = "00000000-0000-4000-8000-0000000000c3";
const TAXES = "00000000-0000-4000-8000-0000000000d0";
const INCOME = "00000000-0000-4000-8000-0000000000c1";

const categories = [
  { id: FOOD, parentId: null, name: "Food" },
  { id: GROCERIES, parentId: FOOD, name: "Groceries" },
  { id: FUN, parentId: null, name: "Fun" },
  { id: HOUSING, parentId: null, name: "Housing" },
  { id: LOANS, parentId: HOUSING, name: "Loans" },
  { id: CARD_BILL, parentId: null, name: "Card bills" },
  { id: TAXES, parentId: null, name: "Taxes" },
  { id: INCOME, parentId: null, name: "Income" },
];
const months = ["2026-08", "2026-09", "2026-10"];

describe("lastFullMonths", () => {
  it("returns the 3 months before the current one, oldest first", () => {
    expect(lastFullMonths(new Date(2026, 10, 4))).toEqual(months);
  });

  it("crosses a year boundary", () => {
    expect(lastFullMonths(new Date(2027, 1, 10))).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("roundUpToStep", () => {
  it("rounds up to the next 50 and keeps exact multiples", () => {
    expect(roundUpToStep(301)).toBe(350);
    expect(roundUpToStep(300)).toBe(300);
    expect(roundUpToStep(300.0000001)).toBe(300);
    expect(roundUpToStep(0.5)).toBe(50);
  });
});

describe("suggestBudgets", () => {
  it("rolls leaf rows up to the top-level parent and averages over the 3 months", () => {
    const rows = [
      { period: "2026-08", categoryId: GROCERIES, amountIls: 400 },
      { period: "2026-08", categoryId: FOOD, amountIls: 100 },
      { period: "2026-09", categoryId: GROCERIES, amountIls: 500 },
      { period: "2026-10", categoryId: GROCERIES, amountIls: 520 },
    ];
    const [food] = suggestBudgets({ rows, categories, months });
    expect(food).toMatchObject({
      categoryId: FOOD,
      categoryName: "Food",
      activeMonths: 3,
      suggestedIls: 550,
    });
    expect(food!.averageIls).toBeCloseTo(506.67, 1);
  });

  it("needs spend in at least 2 of the 3 months", () => {
    const rows = [
      { period: "2026-10", categoryId: FUN, amountIls: 900 },
      { period: "2026-09", categoryId: FOOD, amountIls: 300 },
      { period: "2026-10", categoryId: FOOD, amountIls: 300 },
    ];
    const result = suggestBudgets({ rows, categories, months });
    expect(result.map((row) => row.categoryId)).toEqual([FOOD]);
  });

  it("ignores system buckets, uncategorized, null category and months outside the window", () => {
    const rows = [HOUSING, LOANS, CARD_BILL, TAXES, INCOME, UNCATEGORIZED_CATEGORY_ID, null].flatMap(
      (categoryId) => [
        { period: "2026-09", categoryId, amountIls: 1000 },
        { period: "2026-10", categoryId, amountIls: 1000 },
      ],
    );
    const outside = [
      { period: "2026-07", categoryId: FUN, amountIls: 800 },
      { period: "2026-11", categoryId: FUN, amountIls: 800 },
      { period: "2026-10", categoryId: FUN, amountIls: 800 },
    ];
    const result = suggestBudgets({ rows: [...rows, ...outside], categories, months });
    // Housing itself is a normal spend parent; only its Loans child is a non-spend bucket.
    expect(result.map((row) => row.categoryId)).toEqual([HOUSING]);
    expect(result[0]!.averageIls).toBeCloseTo(667, 0);
  });

  it("does not count a net-refund month as active", () => {
    const rows = [
      { period: "2026-09", categoryId: FUN, amountIls: 100 },
      { period: "2026-10", categoryId: FUN, amountIls: -20 },
      { period: "2026-09", categoryId: FOOD, amountIls: 200 },
      { period: "2026-10", categoryId: FOOD, amountIls: 400 },
    ];
    const result = suggestBudgets({ rows, categories, months });
    expect(result.map((row) => row.categoryId)).toEqual([FOOD]);
  });
});

import { describe, expect, it } from "vitest";
import { sumBudgetScopeSpend } from "./budgets.js";

const categories = [
  { id: "food", parentId: null },
  { id: "groceries", parentId: "food" },
  { id: "fuel", parentId: null },
];

function row(categoryId: string | null, totalAmountIls: number, period = "2026-11", dateBasis = "charge") {
  return { period, dateBasis, categoryId, totalAmountIls };
}

describe("sumBudgetScopeSpend", () => {
  it("counts child categories and card splits toward the parent budget", () => {
    const rollups = [row("food", 100), row("groceries", 250), row("groceries", 50), row("fuel", 999)];
    expect(sumBudgetScopeSpend(rollups, categories, "food", "2026-11")).toBe(400);
  });

  it("ignores other periods, other date bases and uncategorized rows", () => {
    const rollups = [row("food", 100, "2026-10"), row("food", 100, "2026-11", "transaction"), row(null, 5)];
    expect(sumBudgetScopeSpend(rollups, categories, "food", "2026-11")).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import type { CategoryBreakdownItem } from "@moneytrack/contracts";
import { computeDualRingBalance } from "./dual-ring-balance";
import { buildDualRingSlices } from "./dual-ring-slices";

const drillDown = { filter: { dateBasis: "charge" as const }, sourceView: "test" };

function item(name: string, amount: number, id?: string): CategoryBreakdownItem {
  return {
    categoryId: id ?? null,
    categoryName: name,
    amountIls: amount,
    transactionCount: 1,
    drillDown,
  };
}

describe("buildDualRingSlices", () => {
  it("recalculates outer slices against the shared denominator and appends surplus", () => {
    const balance = computeDualRingBalance({ totalIncomeIls: 12_000, totalExpensesIls: 8_000 });
    const { outerSlices, innerSlices } = buildDualRingSlices({
      outerItems: [item("Food", 8_000, "food")],
      innerItems: [item("Salary A", 10_000, "sal-a"), item("Other", 2_000)],
      balance,
    });

    expect(outerSlices.find((slice) => slice.categoryName === "Food")?.percent).toBeCloseTo(66.67, 1);
    expect(outerSlices.find((slice) => slice.isBalanceHighlight)?.balanceKind).toBe("surplus");
    expect(innerSlices.some((slice) => slice.isBalanceHighlight)).toBe(false);
  });

  it("appends deficit to the inner ring when expenses exceed income", () => {
    const balance = computeDualRingBalance({ totalIncomeIls: 4_000, totalExpensesIls: 8_000 });
    const { innerSlices } = buildDualRingSlices({
      outerItems: [item("Food", 8_000)],
      innerItems: [item("Salary A", 4_000, "sal-a")],
      balance,
    });

    expect(innerSlices.find((slice) => slice.isBalanceHighlight)?.balanceKind).toBe("deficit");
  });

  it("renders a full surplus highlight on an empty outer ring (income, no expenses)", () => {
    const balance = computeDualRingBalance({ totalIncomeIls: 10_000, totalExpensesIls: 0 });
    const { outerSlices, innerSlices } = buildDualRingSlices({
      outerItems: [],
      innerItems: [item("Salary A", 10_000, "sal-a")],
      balance,
    });

    expect(outerSlices).toHaveLength(1);
    expect(outerSlices[0]).toMatchObject({
      isBalanceHighlight: true,
      balanceKind: "surplus",
      percent: 100,
    });
    expect(outerSlices[0]!.drillDown).toBeDefined();
    expect(innerSlices).toHaveLength(1);
  });

  it("renders a deficit highlight on an empty inner ring (expenses, no income)", () => {
    const balance = computeDualRingBalance({ totalIncomeIls: 0, totalExpensesIls: 3_000 });
    const { outerSlices, innerSlices } = buildDualRingSlices({
      outerItems: [item("Food", 3_000, "food")],
      innerItems: [],
      balance,
    });

    expect(innerSlices).toHaveLength(1);
    expect(innerSlices[0]).toMatchObject({ isBalanceHighlight: true, balanceKind: "deficit" });
    expect(innerSlices[0]!.drillDown).toBeDefined();
    expect(outerSlices).toHaveLength(1);
  });

  it("returns empty rings when there is no data at all", () => {
    const balance = computeDualRingBalance({ totalIncomeIls: 0, totalExpensesIls: 0 });
    const { outerSlices, innerSlices } = buildDualRingSlices({
      outerItems: [],
      innerItems: [],
      balance,
    });

    expect(outerSlices).toEqual([]);
    expect(innerSlices).toEqual([]);
  });

  it("hides inner slices when hideInnerRing is true", () => {
    const balance = computeDualRingBalance({ totalIncomeIls: 5_000, totalExpensesIls: 5_000 });
    const { innerSlices } = buildDualRingSlices({
      outerItems: [item("Food", 5_000)],
      innerItems: [item("Salary A", 5_000, "sal-a")],
      balance,
      hideInnerRing: true,
    });

    expect(innerSlices).toHaveLength(0);
  });
});

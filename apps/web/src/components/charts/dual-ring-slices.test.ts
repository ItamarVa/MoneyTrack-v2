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

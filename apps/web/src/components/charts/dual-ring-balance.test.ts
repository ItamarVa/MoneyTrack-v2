import { describe, expect, it } from "vitest";
import { computeDualRingBalance } from "./dual-ring-balance";

describe("computeDualRingBalance", () => {
  it("uses max(income, expenses) as denominator", () => {
    const result = computeDualRingBalance({ totalIncomeIls: 12_000, totalExpensesIls: 8_780 });
    expect(result.denominatorIls).toBe(12_000);
  });

  it("puts surplus on the outer ring when income exceeds expenses", () => {
    const result = computeDualRingBalance({ totalIncomeIls: 12_000, totalExpensesIls: 8_780 });
    expect(result.highlight).toEqual({
      ring: "outer",
      kind: "surplus",
      label: "עודף",
      amountIls: 3_220,
      explanation: "נשאר מההכנסות החודש",
    });
  });

  it("puts deficit on the inner ring when expenses exceed income", () => {
    const result = computeDualRingBalance({ totalIncomeIls: 4_000, totalExpensesIls: 8_780 });
    expect(result.highlight).toEqual({
      ring: "inner",
      kind: "deficit",
      label: "חוסר",
      amountIls: 4_780,
      explanation: "חסר לכיסוי ההוצאות",
    });
  });

  it("returns balanced caption when totals match", () => {
    const result = computeDualRingBalance({ totalIncomeIls: 5_000, totalExpensesIls: 5_000 });
    expect(result.caption).toBe("מאוזן");
    expect(result.highlight).toBeNull();
  });

  it("returns no highlight when both sides are zero", () => {
    const result = computeDualRingBalance({ totalIncomeIls: 0, totalExpensesIls: 0 });
    expect(result.denominatorIls).toBe(0);
    expect(result.highlight).toBeNull();
  });

  it("shows full outer surplus when there are no expenses", () => {
    const result = computeDualRingBalance({ totalIncomeIls: 9_500, totalExpensesIls: 0 });
    expect(result.highlight).toEqual({
      ring: "outer",
      kind: "surplus",
      label: "עודף",
      amountIls: 9_500,
      explanation: "נשאר מההכנסות החודש",
    });
  });
});

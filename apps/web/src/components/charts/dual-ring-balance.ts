/**
 * Shared denominator balance model for the dual-ring dashboard chart.
 * Surplus highlights the outer ring; deficit highlights the inner ring.
 */
import type { DualRingBalance, DualRingBalanceHighlight } from "./types";

export function computeDualRingBalance(input: {
  totalIncomeIls: number;
  totalExpensesIls: number;
}): DualRingBalance {
  const income = input.totalIncomeIls;
  const expenses = input.totalExpensesIls;
  const denominatorIls = Math.max(income, expenses);

  if (income === 0 && expenses === 0) {
    return { denominatorIls: 0, highlight: null, caption: null };
  }

  if (income === expenses && income > 0) {
    return { denominatorIls, highlight: null, caption: "מאוזן" };
  }

  if (income > expenses) {
    const highlight: DualRingBalanceHighlight = {
      ring: "outer",
      kind: "surplus",
      label: "עודף",
      amountIls: income - expenses,
      explanation: "נשאר מההכנסות החודש",
    };
    return { denominatorIls, highlight, caption: null };
  }

  const highlight: DualRingBalanceHighlight = {
    ring: "inner",
    kind: "deficit",
    label: "חוסר",
    amountIls: expenses - income,
    explanation: "חסר לכיסוי ההוצאות",
  };
  return { denominatorIls, highlight, caption: null };
}

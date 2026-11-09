/**
 * Spent-vs-budget maths shared by the settings budgets panel and the analysis summary.
 * Tone rule: under 80% neutral, 80-100% warning, over 100% danger. Pure, no React.
 */
export type BudgetTone = "neutral" | "warning" | "danger";

/** Raw usage in percent (not rounded, not capped); 0 when the budget is not positive. */
export function budgetUsagePct(actualIls: number, amountIls: number): number {
  return amountIls > 0 ? (actualIls / amountIls) * 100 : 0;
}

export function budgetTone(usagePct: number): BudgetTone {
  if (usagePct > 100) return "danger";
  if (usagePct >= 80) return "warning";
  return "neutral";
}

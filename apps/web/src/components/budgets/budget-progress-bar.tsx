/**
 * One budget row body: spent / budget text plus a toned progress bar. Used by the settings
 * panel list and the analysis summary so both colour budgets the same way.
 */
import type { BudgetWithVariance } from "@moneytrack/contracts";
import { fillTemplate } from "@/components/category/category-options";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { budgetTone, budgetUsagePct, type BudgetTone } from "./budget-progress";

const TONE_CLASS: Record<BudgetTone, string> = {
  neutral: "bg-brand-blue-500",
  warning: "bg-amber-500",
  danger: "bg-brand-orange-500",
};

export function BudgetProgressBar({ budget }: { budget: BudgetWithVariance }) {
  const usage = budgetUsagePct(budget.actualIls, budget.amount);
  const pct = Math.round(usage);
  const text = he.budgetsUx.progress;

  return (
    <>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pct)}
        aria-label={fillTemplate(text.ariaBar, { category: budget.categoryName, pct })}
        className="h-2 overflow-hidden rounded-full bg-surface-bg"
      >
        <div
          className={["h-full rounded-full transition-all", TONE_CLASS[budgetTone(usage)]].join(" ")}
          style={{ width: `${Math.min(100, usage)}%` }}
        />
      </div>
      {budget.actualIls > budget.amount ? (
        <p className="mt-1 text-xs text-brand-orange-500">
          {fillTemplate(text.over, { amount: formatIls(budget.actualIls - budget.amount) })}
        </p>
      ) : null}
    </>
  );
}

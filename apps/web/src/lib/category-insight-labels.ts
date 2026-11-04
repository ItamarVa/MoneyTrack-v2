/**
 * Hebrew display strings for CategoryInsight kinds. Engine/contracts carry
 * kind-tagged data only; locale lives in the web layer (same pattern as breakdown-labels).
 */
import type { CategoryInsight } from "@moneytrack/contracts";
import { formatIls } from "@/lib/currency";

function formatPct(value: number): string {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  const sign = value > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function formatCategoryInsight(insight: CategoryInsight): string {
  switch (insight.kind) {
    case "missing_recurring":
      return `${insight.merchantName} חויב בדרך כלל ${insight.expectedCount} פעמים בחודש, אך החודש רק ${insight.actualCount} (מבוסס על ${insight.monthsObserved} חודשים)`;
    case "merchant_disappeared":
      return `${insight.merchantName} חויב בכל אחד מ-${insight.monthsObserved} החודשים הקודמים, אך לא החודש`;
    case "merchant_spike":
      return `${insight.merchantName} קפץ ל-${formatIls(insight.amountIls)} (${formatPct(insight.pctChange)} לעומת חציון ${formatIls(insight.medianIls)})`;
    case "merchant_drop":
      return `${insight.merchantName} ירד ל-${formatIls(insight.amountIls)} (${formatPct(insight.pctChange)} לעומת חציון ${formatIls(insight.medianIls)})`;
    case "new_merchant":
      return `${insight.merchantName} הופיע לראשונה בקטגוריה (${formatIls(insight.amountIls)})`;
    case "category_vs_average":
      return `הקטגוריה ב-${formatIls(insight.amountIls)} (${formatPct(insight.pctChange)} לעומת ממוצע ${formatIls(insight.averageIls)})`;
    case "dominant_transaction":
      return `עסקה ב-${insight.merchantName} (${formatIls(insight.amountIls)}) מהווה ${insight.sharePct.toFixed(0)}% מהקטגוריה`;
    default:
      return "תובנה";
  }
}

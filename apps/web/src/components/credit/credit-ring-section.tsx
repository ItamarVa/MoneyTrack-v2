"use client";

/**
 * The round chart for card spending: the shared DrillDownDonut (tap a slice to read it,
 * tap again or use the readout button to drill) fed with card-only category totals.
 * A slice drills to /transactions with the card and basis filter intact — not to the
 * generic category page, which would silently drop the card scope.
 */
import type { AnalysisFilter, CategoryBreakdownItem } from "@moneytrack/contracts";
import { useRouter } from "next/navigation";
import { DrillDownDonut } from "@/components/charts/drill-down-donut";
import type { DrillNavigateAction } from "@/components/charts/types";
import { drillDownToTransactionsUrl } from "@/lib/analysis-filter";
import he from "@/locales/he.json";

type CreditRingSectionProps = {
  items: CategoryBreakdownItem[];
  filter: AnalysisFilter;
  periodLabel: string;
};

export function CreditRingSection({ items, filter, periodLabel }: CreditRingSectionProps) {
  const router = useRouter();

  const handleNavigate = (action: DrillNavigateAction) => {
    if (action.type === "slice") {
      router.push(drillDownToTransactionsUrl(action.item.drillDown.filter));
    }
  };

  return (
    <DrillDownDonut
      items={items}
      filter={filter}
      dimension="category"
      periodLabel={periodLabel}
      level={1}
      breadcrumbs={[]}
      onNavigate={handleNavigate}
      navigateOnSlice={false}
      showMonthNav={false}
      showDimensionSwitcher={false}
      title={he.creditPage.ring.title}
      narrowLayout
    />
  );
}

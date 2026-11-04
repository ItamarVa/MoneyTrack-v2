"use client";

/**
 * In-place drill ring on entity detail pages. Dimension follows the drill stack
 * (category → subcategory → merchant → transaction); slice clicks drill or open drawer.
 */
import type {
  AnalysisFilter,
  BreakdownDimension,
  CategoryBreakdownItem,
} from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DrillDownDonut } from "@/components/charts/drill-down-donut";
import { DIMENSION_LABELS } from "@/components/charts/types";
import type { BreadcrumbSegment, DrillLevel, DrillNavigateAction } from "@/components/charts/types";
import { fetchBreakdown, fetchTransactions } from "@/lib/api-client";
import { entityIdForCategorySlice } from "@/lib/category-ids";
import { formatMonthYear } from "@/lib/dates";
import {
  breakdownRootLabel,
  drillFilter,
  nextDrillDimension,
} from "./entity-dimension";
import {
  directCategoryTransactions,
  transactionsToBreakdownItems,
  TRANSACTION_RING_SOURCE_VIEW,
} from "./entity-transaction-slices";
import type { EntityDrillStep } from "./entity-types";

type EntityBreakdownSectionProps = {
  entityDimension: BreakdownDimension;
  entityId: string;
  entityName: string;
  filter: AnalysisFilter;
  steps: EntityDrillStep[];
  onStepsChange: (steps: EntityDrillStep[]) => void;
  onTransactionSelect: (transactionId: string) => void;
};

export function EntityBreakdownSection({
  entityDimension,
  entityId,
  entityName,
  filter,
  steps,
  onStepsChange,
  onTransactionSelect,
}: EntityBreakdownSectionProps) {
  const deepestDimension = steps.at(-1)?.dimension ?? entityDimension;
  const ringDimension = nextDrillDimension(deepestDimension);
  const ringFilter = useMemo(() => drillFilter(filter, steps), [filter, steps]);

  const [items, setItems] = useState<CategoryBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBreakdown = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (ringDimension === "transaction") {
        const txns = await fetchTransactions(ringFilter, 200);
        setItems(transactionsToBreakdownItems(txns));
        return;
      }

      const response = await fetchBreakdown(ringFilter, ringDimension);
      let merged = response.items;

      if (ringDimension === "subcategory" && entityDimension === "category") {
        const txns = await fetchTransactions(ringFilter, 200);
        const directItems = transactionsToBreakdownItems(
          directCategoryTransactions(txns, entityId),
        );
        merged = [...merged, ...directItems];
      }

      setItems(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת פירוט");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ringDimension, ringFilter, entityDimension, entityId]);

  useEffect(() => {
    void loadBreakdown();
  }, [loadBreakdown]);

  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    if (steps.length === 0) {
      return [];
    }

    const rootLabel =
      entityName.trim() || breakdownRootLabel(nextDrillDimension(entityDimension));
    const trail: BreadcrumbSegment[] = [
      {
        label: rootLabel,
        level: 1,
        filter,
        dimension: entityDimension,
      },
    ];

    steps.forEach((step, index) => {
      const stepFilter = drillFilter(filter, steps.slice(0, index + 1));
      trail.push({
        label: step.name,
        level: Math.min(3, index + 2) as DrillLevel,
        filter: stepFilter,
        dimension: step.dimension,
      });
    });

    return trail;
  }, [entityDimension, entityName, filter, steps]);

  const periodLabel = formatMonthYear(filter.dateTo ?? filter.dateFrom ?? "");

  const handleNavigate = (action: DrillNavigateAction) => {
    if (action.type === "breadcrumb") {
      const index = breadcrumbs.indexOf(action.segment);
      if (index < 0) return;

      const isLast = index === breadcrumbs.length - 1;
      if (isLast && ringDimension === "transaction") {
        onStepsChange(steps.slice(0, -1));
        return;
      }

      onStepsChange(index > 0 ? steps.slice(0, index) : []);
      return;
    }

    if (action.type === "slice") {
      const sliceId = entityIdForCategorySlice(ringDimension, action.item.categoryId);
      if (!sliceId) return;

      // Direct-on-parent rows are merged into the subcategory ring, so a slice
      // here may carry a transaction id rather than a category id.
      if (
        ringDimension === "transaction" ||
        action.item.drillDown.sourceView === TRANSACTION_RING_SOURCE_VIEW
      ) {
        onTransactionSelect(sliceId);
        return;
      }

      const stepDimension = ringDimension as BreakdownDimension;
      const last = steps[steps.length - 1];
      if (last?.id === sliceId && last.dimension === stepDimension) {
        onStepsChange(steps.slice(0, -1));
        return;
      }

      onStepsChange([
        ...steps,
        {
          dimension: stepDimension,
          id: sliceId,
          name: action.item.categoryName,
        },
      ]);
    }
  };

  if (error) {
    return (
      <section className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="text-sm text-brand-orange-500">{error}</p>
      </section>
    );
  }

  if (loading && items.length === 0) {
    return (
      <section className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          טוען פירוט…
        </p>
      </section>
    );
  }

  return (
    <DrillDownDonut
      key={steps.map((step) => step.id).join("-") || "all"}
      items={items}
      filter={ringFilter}
      dimension={ringDimension}
      periodLabel={periodLabel}
      level={1}
      breadcrumbs={breadcrumbs}
      onNavigate={handleNavigate}
      navigateOnSlice={false}
      breadcrumbLastClickable={ringDimension === "transaction" && steps.length > 0}
      showMonthNav={false}
      showDimensionSwitcher={false}
      title={DIMENSION_LABELS[ringDimension]}
      narrowLayout
    />
  );
}

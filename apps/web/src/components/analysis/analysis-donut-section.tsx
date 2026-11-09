"use client";

/**
 * Analysis drill-down donut: respects page URL filter and wires fetchBreakdown
 * with dimension switcher (same pattern as dashboard-donut-section).
 */
import type { AnalysisFilter, BreakdownDimension, CategoryBreakdownItem } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DrillDownDonut } from "@/components/charts/drill-down-donut";
import type { BreadcrumbSegment, DrillNavigateAction } from "@/components/charts/types";
import { shiftMonth } from "@/lib/analysis-filter";
import { fetchBreakdown } from "@/lib/api-client";
import { formatMonthYear } from "@/lib/dates";

const ROOT_LABEL = "הכל";

type AnalysisDonutSectionProps = {
  pageFilter: AnalysisFilter;
  onFilterChange: (next: AnalysisFilter) => void;
};

function rootBreadcrumb(filter: AnalysisFilter, dimension: BreakdownDimension): BreadcrumbSegment {
  return { label: ROOT_LABEL, level: 1, filter, dimension };
}

export function AnalysisDonutSection({ pageFilter, onFilterChange }: AnalysisDonutSectionProps) {
  const [dimension, setDimension] = useState<BreakdownDimension>("category");
  const [items, setItems] = useState<CategoryBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDimension("category");
  }, [pageFilter]);

  const loadBreakdown = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchBreakdown(pageFilter, dimension);
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת פירוט");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dimension, pageFilter]);

  useEffect(() => {
    void loadBreakdown();
  }, [loadBreakdown]);

  const breadcrumbs = useMemo(
    () => [rootBreadcrumb(pageFilter, dimension)],
    [dimension, pageFilter],
  );

  const periodLabel =
    pageFilter.dateFrom || pageFilter.dateTo
      ? formatMonthYear(pageFilter.dateTo ?? pageFilter.dateFrom ?? "")
      : "כל התקופה";

  const handleNavigate = (action: DrillNavigateAction) => {
    if (action.type === "dimension") {
      setDimension(action.dimension);
      return;
    }

    if (action.type === "month") {
      onFilterChange(shiftMonth(pageFilter, action.direction));
      return;
    }

    if (action.type === "breadcrumb") {
      onFilterChange(action.segment.filter);
      setDimension(action.segment.dimension);
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
      items={items}
      filter={pageFilter}
      dimension={dimension}
      periodLabel={periodLabel}
      level={1}
      breadcrumbs={breadcrumbs}
      onNavigate={handleNavigate}
      showMonthNav={false}
    />
  );
}

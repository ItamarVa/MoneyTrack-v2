"use client";

/**
 * Unified dual-ring dashboard chart: outer expenses, inner salaries.
 */
import type {
  AnalysisFilter,
  AnalysisSummaryResponse,
  BreakdownDimension,
  BreakdownResponse,
  CategoryBreakdownItem,
} from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { computeDualRingBalance } from "@/components/charts/dual-ring-balance";
import { apiUrl } from "@/lib/base-path";
import { DualRingDonut } from "@/components/charts/dual-ring-donut";
import type { BreadcrumbSegment, DrillNavigateAction } from "@/components/charts/types";
import {
  periodFromFilter,
  shiftGlobalPeriod,
  useGlobalPeriod,
} from "@/components/period/period-context";
import { fetchAnalysisSummary, fetchPeople, fetchSalarySources } from "@/lib/api-client";
import { formatMonthYear } from "@/lib/dates";
import { monthBoundsFor } from "@/lib/analysis-filter";

const ROOT_LABEL = "הכל";

type DashboardRingsSectionProps = {
  filter: AnalysisFilter;
};

function rootBreadcrumb(filter: AnalysisFilter, dimension: BreakdownDimension): BreadcrumbSegment {
  return { label: ROOT_LABEL, level: 1, filter, dimension };
}

async function fetchBreakdownWithFlow(
  filter: AnalysisFilter,
  dimension: BreakdownDimension,
  flow: "expense" | "income",
): Promise<BreakdownResponse> {
  const response = await fetch(apiUrl("/api/analysis/breakdown"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...filter, dimension, flow }),
    cache: "no-store",
  });
  const data = (await response.json()) as BreakdownResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export function DashboardRingsSection({ filter }: DashboardRingsSectionProps) {
  const { period, setPeriod } = useGlobalPeriod();
  const [dimension, setDimension] = useState<BreakdownDimension>("category");
  const [incomeDimension, setIncomeDimension] = useState<BreakdownDimension>("salary");
  const [summary, setSummary] = useState<AnalysisSummaryResponse | null>(null);
  const [outerItems, setOuterItems] = useState<CategoryBreakdownItem[]>([]);
  const [innerItems, setInnerItems] = useState<CategoryBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [innerMeta, setInnerMeta] = useState<Record<string, { personName: string | null }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, expenseData, incomeData] = await Promise.all([
        fetchAnalysisSummary(filter),
        fetchBreakdownWithFlow(filter, dimension, "expense"),
        fetchBreakdownWithFlow(filter, incomeDimension, "income"),
      ]);
      setSummary(summaryData);
      setOuterItems(expenseData.items);
      setInnerItems(incomeData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת טבעות");
      setSummary(null);
      setOuterItems([]);
      setInnerItems([]);
    } finally {
      setLoading(false);
    }
  }, [dimension, filter, incomeDimension]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [salarySources, people] = await Promise.all([
          fetchSalarySources(),
          fetchPeople(),
        ]);
        const peopleById = new Map(people.map((person) => [person.id, person.displayName]));
        const meta: Record<string, { personName: string | null }> = {};
        for (const source of salarySources) {
          meta[source.id] = {
            personName: source.personId ? peopleById.get(source.personId) ?? null : null,
          };
        }
        setInnerMeta(meta);
      } catch {
        setInnerMeta({});
      }
    })();
  }, []);

  const balance = useMemo(() => {
    if (!summary) {
      return computeDualRingBalance({ totalIncomeIls: 0, totalExpensesIls: 0 });
    }
    return computeDualRingBalance({
      totalIncomeIls: summary.totalIncomeIls,
      totalExpensesIls: summary.totalExpensesIls,
    });
  }, [summary]);

  const breadcrumbs = useMemo(() => {
    const anchor = filter.dateFrom ?? filter.dateTo ?? new Date().toISOString().slice(0, 10);
    const [year, month] = anchor.split("-").map(Number);
    const monthFilter: AnalysisFilter = {
      dateBasis: filter.dateBasis ?? "charge",
      ...monthBoundsFor(new Date(year ?? 0, (month ?? 1) - 1, 1)),
    };
    return [rootBreadcrumb(monthFilter, dimension)];
  }, [dimension, filter]);

  const periodLabel = formatMonthYear(filter.dateTo ?? filter.dateFrom ?? "");

  const handleNavigate = (action: DrillNavigateAction) => {
    if (action.type === "dimension") {
      setDimension(action.dimension);
      return;
    }

    if (action.type === "month") {
      setPeriod(shiftGlobalPeriod(period, action.direction));
      return;
    }

    if (action.type === "breadcrumb") {
      setPeriod(periodFromFilter(action.segment.filter));
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

  if (loading && !summary) {
    return (
      <section className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          טוען טבעות פירוט…
        </p>
      </section>
    );
  }

  return (
    <DualRingDonut
      outerItems={outerItems}
      innerItems={innerItems}
      filter={filter}
      dimension={dimension}
      periodLabel={periodLabel}
      breadcrumbs={breadcrumbs}
      onNavigate={handleNavigate}
      showMonthNav={false}
      balance={balance}
      totalIncomeIls={summary?.totalIncomeIls ?? 0}
      totalExpensesIls={summary?.totalExpensesIls ?? 0}
      innerMeta={incomeDimension === "salary" ? innerMeta : {}}
      incomeDimension={incomeDimension}
      onIncomeDimensionChange={setIncomeDimension}
    />
  );
}

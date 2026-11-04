"use client";

/**
 * Fixture-driven shell for Wave 1 chart development.
 * Owns drill state, breadcrumb composition, and optional URL persistence.
 */
import type {
  AnalysisFilter,
  BreakdownDimension,
  CategoryBreakdownItem,
} from "@moneytrack/contracts";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { filterFromSearchParams, filterToSearchParams } from "@/lib/analysis-filter";
import { formatMonthYear } from "@/lib/dates";
import { DrillDownDonut } from "./drill-down-donut";
import {
  FIXTURE_CATEGORY_IDS,
  FIXTURE_LEVEL3_TRANSACTIONS,
  FIXTURE_MONTHLY_SERIES,
  FIXTURE_PERIOD_LABEL,
  FIXTURE_TREND_POINTS,
  fixtureBreakdownFor,
} from "./fixtures/chart-fixtures";
import { MonthlyBarsPanel } from "./monthly-bars-panel";
import type { BreadcrumbSegment, DrillLevel, DrillNavigateAction } from "./types";

const ROOT_LABEL = "הכל";

function defaultFilter(): AnalysisFilter {
  return {
    dateBasis: "transaction",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
  };
}

function rootBreadcrumb(filter: AnalysisFilter, dimension: BreakdownDimension): BreadcrumbSegment {
  return { label: ROOT_LABEL, level: 1, filter, dimension };
}

function shiftMonth(filter: AnalysisFilter, direction: -1 | 1): AnalysisFilter {
  const anchor = filter.dateFrom ?? "2026-08-01";
  const date = new Date(anchor);
  date.setMonth(date.getMonth() + direction);
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    ...filter,
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

function parseDonutState(params: URLSearchParams): {
  filter: AnalysisFilter;
  dimension: BreakdownDimension;
  level: DrillLevel;
} {
  const dimension = (params.get("donutDim") as BreakdownDimension | null) ?? "category";
  const level = Number(params.get("donutLevel") ?? "1");
  const safeLevel: DrillLevel = level === 2 ? 2 : level === 3 ? 3 : 1;
  const filter = filterFromSearchParams(params);
  return {
    filter: Object.keys(filter).length > 0 ? filter : defaultFilter(),
    dimension,
    level: safeLevel,
  };
}

function writeDonutState(
  filter: AnalysisFilter,
  dimension: BreakdownDimension,
  level: DrillLevel,
): URLSearchParams {
  const params = filterToSearchParams(filter);
  params.set("donutDim", dimension);
  params.set("donutLevel", String(level));
  return params;
}

type ChartsFixtureShellProps = {
  persistToUrl?: boolean;
};

export function ChartsFixtureShell({ persistToUrl = false }: ChartsFixtureShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => (persistToUrl ? parseDonutState(new URLSearchParams(searchParams.toString())) : null),
    [persistToUrl, searchParams],
  );

  const [filter, setFilter] = useState<AnalysisFilter>(initial?.filter ?? defaultFilter());
  const [dimension, setDimension] = useState<BreakdownDimension>(initial?.dimension ?? "category");
  const [level, setLevel] = useState<DrillLevel>(initial?.level ?? 1);
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-08");

  const persist = useCallback(
    (nextFilter: AnalysisFilter, nextDimension: BreakdownDimension, nextLevel: DrillLevel) => {
      if (!persistToUrl) return;
      const params = writeDonutState(nextFilter, nextDimension, nextLevel);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [persistToUrl, router],
  );

  const items: CategoryBreakdownItem[] = useMemo(() => {
    if (level === 3) return [];
    if (level === 2) {
      return fixtureBreakdownFor("subcategory", filter);
    }
    return fixtureBreakdownFor(dimension, filter);
  }, [dimension, filter, level]);

  const breadcrumbs = useMemo(() => {
    const trail: BreadcrumbSegment[] = [rootBreadcrumb(defaultFilter(), dimension)];
    if (filter.categoryIds?.length === 1 && level >= 2) {
      trail.push({
        label: "מזון וסופר",
        level: 2,
        filter: { ...defaultFilter(), categoryIds: [filter.categoryIds[0]!] },
        dimension: "subcategory",
      });
    }
    if (level === 3) {
      trail.push({
        label: "פירוט",
        level: 3,
        filter,
        dimension: "subcategory",
      });
    }
    return trail;
  }, [dimension, filter, level]);

  const periodLabel = formatMonthYear(filter.dateTo ?? filter.dateFrom ?? FIXTURE_PERIOD_LABEL);

  const handleNavigate = (action: DrillNavigateAction) => {
    if (action.type === "dimension") {
      setDimension(action.dimension);
      setLevel(1);
      setFilter(defaultFilter());
      persist(defaultFilter(), action.dimension, 1);
      return;
    }

    if (action.type === "month") {
      const nextFilter = shiftMonth(filter, action.direction);
      setFilter(nextFilter);
      persist(nextFilter, dimension, level);
      return;
    }

    if (action.type === "breadcrumb") {
      setFilter(action.segment.filter);
      setDimension(action.segment.dimension);
      setLevel(action.segment.level);
      persist(action.segment.filter, action.segment.dimension, action.segment.level);
      return;
    }

    const item = action.item;
    if (level === 1 && dimension === "category" && item.categoryId) {
      const nextFilter: AnalysisFilter = {
        ...filter,
        categoryIds: [item.categoryId],
      };
      setFilter(nextFilter);
      setDimension("subcategory");
      setLevel(2);
      persist(nextFilter, "subcategory", 2);
      return;
    }

    if (level === 2 || (level === 1 && dimension !== "category")) {
      if (item.categoryId === FIXTURE_CATEGORY_IDS.supermarket || level === 2) {
        setLevel(3);
        persist(filter, dimension, 3);
      }
    }
  };

  return (
    <div className="space-y-6">
      <DrillDownDonut
        items={items}
        filter={filter}
        dimension={dimension}
        periodLabel={periodLabel}
        level={level}
        breadcrumbs={breadcrumbs}
        level3Transactions={FIXTURE_LEVEL3_TRANSACTIONS}
        onNavigate={handleNavigate}
        persistToUrl={persistToUrl}
      />
      <MonthlyBarsPanel
        monthlySeries={FIXTURE_MONTHLY_SERIES}
        trendPoints={FIXTURE_TREND_POINTS}
        periodLabel="12 חודשים אחרונים"
        onMonthSelect={(period) => {
          setSelectedMonth(period);
          const [year, month] = period.split("-").map(Number);
          const start = new Date(year!, month! - 1, 1);
          const end = new Date(year!, month!, 0);
          const nextFilter: AnalysisFilter = {
            ...defaultFilter(),
            dateFrom: start.toISOString().slice(0, 10),
            dateTo: end.toISOString().slice(0, 10),
          };
          setFilter(nextFilter);
          setLevel(1);
          setDimension("category");
          persist(nextFilter, "category", 1);
        }}
      />
      {selectedMonth ? (
        <p className="text-xs text-text-muted">חודש נבחר: {selectedMonth}</p>
      ) : null}
    </div>
  );
}

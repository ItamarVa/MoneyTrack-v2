"use client";

import type { AnalysisFilter, AnalysisSummaryResponse, DateBasis } from "@moneytrack/contracts";
import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  activeFilterCount,
  AnalysisFilterDrawer,
} from "@/components/analysis/analysis-filter-drawer";
import { AnalysisDonutSection } from "@/components/analysis/analysis-donut-section";
import { AnalysisKpiCards } from "@/components/analysis/analysis-kpi-cards";
import { AnalysisMonthlySection } from "@/components/analysis/analysis-monthly-section";
import { BudgetSummary } from "@/components/budgets/budget-summary";
import {
  ALL_PERIOD,
  periodToFilter,
  type GlobalPeriod,
} from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";
import { filterFromSearchParams, filterToSearchParams } from "@/lib/analysis-filter";
import { fetchAnalysisSummary } from "@/lib/api-client";
import { apiUrl } from "@/lib/base-path";
import he from "@/locales/he.json";

const copy = he.plainUx.analysis;

function urlPeriodFromParams(params: URLSearchParams): GlobalPeriod | null {
  const keys = [...params.keys()];
  if (keys.length === 0) return null;
  const dateFrom = params.get("dateFrom");
  if (dateFrom) return dateFrom.slice(0, 7);
  if (!params.has("dateFrom") && !params.has("dateTo")) return ALL_PERIOD;
  return null;
}

function extraFilterFromParams(params: URLSearchParams): Partial<AnalysisFilter> {
  const keys = [...params.keys()].filter((key) => key !== "dateFrom" && key !== "dateTo");
  if (keys.length === 0) return {};
  const parsed = filterFromSearchParams(params);
  const { dateFrom: _from, dateTo: _to, ...rest } = parsed;
  return rest;
}

export function AnalysisPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const urlPeriod = useMemo(() => urlPeriodFromParams(params), [params]);
  const { period, ready } = useScreenPeriod(urlPeriod);

  const dateBasis = useMemo((): DateBasis => {
    if (!params.has("dateBasis")) return DEFAULT_DATE_BASIS;
    return filterFromSearchParams(params).dateBasis ?? DEFAULT_DATE_BASIS;
  }, [params]);

  const extraFilter = useMemo(() => extraFilterFromParams(params), [params]);

  const filter = useMemo(
    () => ({
      ...periodToFilter(period, dateBasis),
      ...extraFilter,
      dateBasis,
    }),
    [period, dateBasis, extraFilter],
  );

  const [summary, setSummary] = useState<AnalysisSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const updateFilter = useCallback(
    (next: AnalysisFilter) => {
      const nextParams = filterToSearchParams(next);
      router.replace(`/analysis?${nextParams.toString()}`);
    },
    [router],
  );

  useEffect(() => {
    if (!ready) return;
    const bounds = periodToFilter(period, dateBasis);
    const urlFrom = params.get("dateFrom");
    const urlTo = params.get("dateTo");
    const boundsMatch =
      period === ALL_PERIOD
        ? !urlFrom && !urlTo
        : urlFrom === bounds.dateFrom && urlTo === bounds.dateTo;
    if (boundsMatch) return;

    const next = { ...extraFilter, ...bounds, dateBasis };
    router.replace(`/analysis?${filterToSearchParams(next).toString()}`);
  }, [ready, period, dateBasis, extraFilter, params, router]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAnalysisSummary(filter)
      .then((summaryResponse) => {
        if (!cancelled) setSummary(summaryResponse);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינה");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter]);

  const exportUrl = apiUrl(`/api/analysis/export?${filterToSearchParams(filter).toString()}`);
  const filtersActive = activeFilterCount(filter);

  const handleMonthSelect = () => {
    document.getElementById("analysis-donut")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-text-primary sm:text-3xl">ניתוח</h1>
          <p className="mt-1 text-sm text-text-secondary sm:mt-2">
            תמונת מצב פיננסית · לחצו על כל רכיב לפירוט עסקאות
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="min-h-11 rounded-lg border border-border-subtle bg-surface-elevated px-4 text-sm font-medium text-text-primary"
          >
            מסננים{filtersActive > 0 ? ` (${filtersActive})` : ""}
          </button>
          <details className="relative hidden md:block">
            <summary
              aria-label={copy.moreActions}
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated text-text-primary"
            >
              ⋯
            </summary>
            <a
              href={exportUrl}
              className="absolute end-0 z-10 mt-1 whitespace-nowrap rounded-lg border border-border-subtle bg-surface-card px-4 py-2.5 text-sm font-medium text-text-primary shadow-md"
            >
              {copy.exportFile}
            </a>
          </details>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-brand-orange-500">
          {error}
        </p>
      ) : null}

      <AnalysisKpiCards summary={summary} filter={filter} loading={loading} />
      <BudgetSummary period={period} />

      <div id="analysis-donut">
        <AnalysisDonutSection pageFilter={filter} onFilterChange={updateFilter} />
      </div>

      <AnalysisMonthlySection filter={filter} onMonthSelect={handleMonthSelect} />

      <AnalysisFilterDrawer
        open={drawerOpen}
        filter={filter}
        onClose={() => setDrawerOpen(false)}
        onApply={updateFilter}
      />
    </div>
  );
}

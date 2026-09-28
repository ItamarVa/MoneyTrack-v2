"use client";

/**
 * Analysis monthly bars: loads monthly series and category trend for the page filter,
 * renders shared MonthlyBarsPanel with YoY grouped comparison.
 */
import type { AnalysisFilter, MonthlySeriesPoint, TrendPoint } from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { MonthlyBarsPanel } from "@/components/charts/monthly-bars-panel";
import { fetchCategoryTrend } from "@/lib/api-client";
import { apiUrl } from "@/lib/base-path";

type AnalysisMonthlySectionProps = {
  filter: AnalysisFilter;
  onMonthSelect?: (period: string) => void;
};

function expandedSeriesFilter(filter: AnalysisFilter): AnalysisFilter {
  const anchor = filter.dateFrom ?? filter.dateTo ?? new Date().toISOString().slice(0, 10);
  const date = new Date(anchor);
  date.setFullYear(date.getFullYear() - 1);
  return {
    ...filter,
    dateFrom: date.toISOString().slice(0, 10),
  };
}

async function fetchMonthlySeries(filter: AnalysisFilter): Promise<MonthlySeriesPoint[]> {
  const response = await fetch(apiUrl("/api/analysis/monthly"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filter),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "שגיאה בטעינת מגמה חודשית");
  }
  const data = (await response.json()) as { series: MonthlySeriesPoint[] };
  return data.series;
}

function periodLabel(filter: AnalysisFilter, series: MonthlySeriesPoint[]): string {
  if (series.length === 0) {
    const from = filter.dateFrom ?? "";
    const to = filter.dateTo ?? "";
    return from && to ? `${from} — ${to}` : "תקופה שנבחרה";
  }
  const first = series[0]!.period;
  const last = series[series.length - 1]!.period;
  return `${first} — ${last}`;
}

function periodFromFilter(filter: AnalysisFilter): string {
  const anchor = filter.dateFrom ?? filter.dateTo ?? new Date().toISOString().slice(0, 10);
  const [year, month] = anchor.split("-");
  return `${year}-${month}`;
}

export function AnalysisMonthlySection({ filter, onMonthSelect }: AnalysisMonthlySectionProps) {
  const [monthlySeries, setMonthlySeries] = useState<MonthlySeriesPoint[]>([]);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seriesFilter = useMemo(() => expandedSeriesFilter(filter), [filter]);
  const label = useMemo(() => periodLabel(filter, monthlySeries), [filter, monthlySeries]);
  const selectedPeriod = useMemo(() => periodFromFilter(filter), [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all([
      fetchMonthlySeries(seriesFilter),
      fetchCategoryTrend(filter),
    ])
      .then(([series, trend]) => {
        if (!cancelled) {
          setMonthlySeries(series);
          setTrendPoints(trend.points);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינת מגמה");
          setMonthlySeries([]);
          setTrendPoints([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter, seriesFilter]);

  if (error) {
    return (
      <section className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="text-sm text-brand-orange-500">{error}</p>
      </section>
    );
  }

  if (loading && monthlySeries.length === 0) {
    return (
      <section className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          טוען מגמה חודשית…
        </p>
      </section>
    );
  }

  return (
    <MonthlyBarsPanel
      monthlySeries={monthlySeries}
      trendPoints={trendPoints}
      periodLabel={label}
      selectedPeriod={selectedPeriod}
      onMonthSelect={onMonthSelect}
    />
  );
}

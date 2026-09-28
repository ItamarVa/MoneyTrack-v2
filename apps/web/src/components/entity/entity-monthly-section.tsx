"use client";

/**
 * Twelve-month expense trend for one entity on the detail page.
 */
import type { AnalysisFilter, MonthlySeriesPoint } from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { MonthlyBarsPanel } from "@/components/charts/monthly-bars-panel";
import { apiUrl } from "@/lib/base-path";
import { expandedMonthlyFilter, periodFromFilter } from "./entity-dimension";

type EntityMonthlySectionProps = {
  filter: AnalysisFilter;
  onMonthSelect: (period: string) => void;
};

async function fetchMonthlySeries(filter: AnalysisFilter): Promise<MonthlySeriesPoint[]> {
  const response = await fetch(apiUrl("/api/analysis/monthly"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filter),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "שגיאה בטעינת מגמה חודשית");
  }
  const data = (await response.json()) as { series: MonthlySeriesPoint[] };
  return data.series;
}

function seriesPeriodLabel(series: MonthlySeriesPoint[]): string {
  if (series.length === 0) return "12 חודשים אחרונים";
  const first = series[0]!.period;
  const last = series[series.length - 1]!.period;
  return `${first} — ${last}`;
}

export function EntityMonthlySection({ filter, onMonthSelect }: EntityMonthlySectionProps) {
  const [monthlySeries, setMonthlySeries] = useState<MonthlySeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seriesFilter = useMemo(() => expandedMonthlyFilter(filter), [filter]);
  const label = useMemo(() => seriesPeriodLabel(monthlySeries), [monthlySeries]);
  const selectedPeriod = useMemo(() => periodFromFilter(filter), [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchMonthlySeries(seriesFilter)
      .then((series) => {
        if (!cancelled) setMonthlySeries(series);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינת מגמה");
          setMonthlySeries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesFilter]);

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
    <div className="min-w-0 overflow-x-hidden">
      <MonthlyBarsPanel
        monthlySeries={monthlySeries}
        periodLabel={label}
        selectedPeriod={selectedPeriod || undefined}
        onMonthSelect={onMonthSelect}
      />
    </div>
  );
}

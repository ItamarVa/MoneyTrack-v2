"use client";

/**
 * 30-day cashflow outflow forecast from recurring payments and loan schedules.
 */
import type { CashflowForecastResponse } from "@moneytrack/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import { useReducedMotion } from "@/components/charts/use-reduced-motion";
import { renderCompactBarLabel } from "@/components/charts/chart-bar-label";

type DashboardCashflowForecastProps = {
  forecast: CashflowForecastResponse | null;
  loading?: boolean;
};

function aggregateByDate(forecast: CashflowForecastResponse) {
  const byDate = new Map<string, number>();
  for (const point of forecast.points) {
    byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.amountIls);
  }
  return [...byDate.entries()]
    .map(([date, amountIls]) => ({ date, amountIls, label: formatShortDate(date) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function DashboardCashflowForecast({ forecast, loading }: DashboardCashflowForecastProps) {
  const reducedMotion = useReducedMotion();
  const chartRef = useRef<HTMLDivElement>(null);
  const [showBarLabels, setShowBarLabels] = useState(true);
  const chartData = useMemo(
    () => (forecast ? aggregateByDate(forecast) : []),
    [forecast],
  );
  const barLabel = useMemo(() => renderCompactBarLabel(showBarLabels), [showBarLabels]);

  useEffect(() => {
    const element = chartRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setShowBarLabels(entry.contentRect.width >= 360);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg text-text-primary">תחזית תזרים — 30 יום</h2>
        {forecast ? (
          <p className="mt-1 text-sm text-text-muted">
            סה״כ יציאות צפויות:{" "}
            <bdi dir="ltr">{formatIls(forecast.totalOutflowIls)}</bdi>
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          טוען תחזית…
        </p>
      ) : chartData.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          אין תשלומים צפויים ב־30 הימים הקרובים
        </p>
      ) : (
        <div dir="ltr" ref={chartRef} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => formatIls(Number(value))} width={72} />
              <Tooltip
                content={({
                  active,
                  payload,
                }: {
                  active?: boolean;
                  payload?: ReadonlyArray<{ value?: number; payload?: { date?: string } }>;
                }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload;
                  return (
                    <div
                      dir="rtl"
                      className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
                    >
                      <p className="font-medium text-text-primary">
                        {row?.date ? formatShortDate(row.date) : ""}
                      </p>
                      <p className="text-text-secondary">
                        יציאה צפויה:{" "}
                        <bdi dir="ltr">{formatIls(Number(payload[0]?.value))}</bdi>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="amountIls"
                fill="var(--brand-orange-500)"
                isAnimationActive={!reducedMotion}
              >
                <LabelList dataKey="amountIls" content={barLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

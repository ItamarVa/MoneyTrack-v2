"use client";

/**
 * Monthly bars panel: expenses, income-vs-expense, and stacked category modes,
 * with optional grouped year-over-year comparison and a 12-month average line.
 */
import type { TrendPoint } from "@moneytrack/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColor, INCOME_CHART_COLORS } from "@/lib/chart-colors";
import { formatIls } from "@/lib/currency";
import { formatYoYDelta } from "./breakdown-utils";
import { renderCompactBarLabel } from "./chart-bar-label";
import {
  alignYearOverYear,
  buildYoYSummaryLine,
  computeTwelveMonthExpenseAverage,
  hasPriorYearData,
} from "./monthly-utils";
import { MonthlyBarsDataTable } from "./monthly-bars-data-table";
import type { MonthlyBarsMode, MonthlyBarsPanelProps, YearOverYearRow } from "./types";
import { MONTHLY_MODE_LABELS } from "./types";
import { useReducedMotion } from "./use-reduced-motion";

function formatPeriod(period: string): string {
  const [, month = ""] = period.split("-");
  return month;
}

function buildCategoryChartData(points: TrendPoint[]) {
  const keys = new Set<string>();
  for (const point of points) {
    for (const segment of point.segments) {
      keys.add(segment.categoryName);
    }
  }
  const orderedKeys = [...keys];
  const data = points.map((point) => {
    const row: Record<string, string | number> = { period: point.period };
    for (const key of orderedKeys) {
      const segment = point.segments.find((item) => item.categoryName === key);
      row[key] = segment ? Math.abs(segment.amountIls) : 0;
    }
    return row;
  });
  return { data, orderedKeys };
}

export function MonthlyBarsPanel({
  monthlySeries,
  trendPoints = [],
  periodLabel,
  selectedPeriod,
  onMonthSelect,
}: MonthlyBarsPanelProps) {
  const reducedMotion = useReducedMotion();
  const chartRef = useRef<HTMLDivElement>(null);
  const [showBarLabels, setShowBarLabels] = useState(true);
  const [mode, setMode] = useState<MonthlyBarsMode>("expenses");
  const [showYoY, setShowYoY] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const yoyRows = useMemo(() => alignYearOverYear(monthlySeries), [monthlySeries]);
  const averageExpenses = useMemo(() => computeTwelveMonthExpenseAverage(yoyRows), [yoyRows]);
  const yoySummary = useMemo(() => buildYoYSummaryLine(yoyRows), [yoyRows]);
  const priorAvailable = useMemo(() => hasPriorYearData(yoyRows), [yoyRows]);

  const incomeExpenseData = useMemo(
    () =>
      yoyRows.map((row) => ({
        period: row.currentPeriod,
        monthLabel: row.monthLabel,
        income: row.currentIncome,
        expenses: row.currentExpenses,
        net: row.currentNet,
      })),
    [yoyRows],
  );

  const categoryChart = useMemo(() => buildCategoryChartData(trendPoints), [trendPoints]);

  const handleBarClick = (period: string | undefined) => {
    if (period) onMonthSelect?.(period);
  };

  const yoyEnabled = mode === "expenses" && showYoY && priorAvailable;
  const averageLabel =
    yoyRows.length > 0 ? `ממוצע ${yoyRows.length} חודשים` : "ממוצע";
  // Expense bars are their own surface: the axis and legend say "הוצאות", so a
  // minus sign on top of a bar that grows upwards only reads as a mistake.
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
      setShowBarLabels(entry.contentRect.width >= 480);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-label="מגמת חודשים"
      className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-text-primary">מגמת חודשים</h2>
          <p className="mt-1 text-sm text-text-muted">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="מצב תצוגה">
          {(Object.keys(MONTHLY_MODE_LABELS) as MonthlyBarsMode[]).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={mode === entry}
              onClick={() => {
                setMode(entry);
                if (entry !== "expenses") setShowYoY(false);
              }}
              className={[
                "rounded-full px-3 py-1.5 text-sm transition",
                mode === entry
                  ? "bg-brand-orange-500 text-white shadow-sm"
                  : "border border-border-subtle bg-surface-card text-text-secondary hover:border-brand-blue-500/40",
              ].join(" ")}
            >
              {MONTHLY_MODE_LABELS[entry]}
            </button>
          ))}
        </div>
      </div>

      {mode === "expenses" ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{yoySummary}</p>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={showYoY}
              disabled={!priorAvailable}
              onChange={(event) => setShowYoY(event.target.checked)}
            />
            מול שנה קודמת
          </label>
        </div>
      ) : null}

      {!priorAvailable && mode === "expenses" && showYoY ? (
        <p className="mb-3 text-sm text-text-muted">אין עדיין נתונים לשנה קודמת</p>
      ) : null}

      {monthlySeries.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          אין נתוני מגמה לתקופה שנבחרה
        </p>
      ) : (
        <div dir="ltr" ref={chartRef} className="h-72 w-full min-w-0 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            {mode === "expenses" ? (
              <BarChart data={yoyRows} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="monthLabel" />
                <YAxis tickFormatter={(value) => formatIls(Number(value))} width={72} />
                <Tooltip
                  content={({
                    active,
                    payload,
                  }: {
                    active?: boolean;
                    payload?: ReadonlyArray<{ payload?: YearOverYearRow }>;
                  }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload;
                    if (!row) return null;
                    const yoyLine =
                      row.yoyExpensePct != null && Number.isFinite(row.yoyExpensePct)
                        ? formatYoYDelta(row.yoyExpensePct)
                        : null;
                    return (
                      <div
                        dir="rtl"
                        className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
                      >
                        <p className="font-medium text-text-primary">{row.monthLabel}</p>
                        <p className="text-text-secondary">
                          השנה: <bdi dir="ltr">{formatIls(row.currentExpenses)}</bdi>
                          {yoyLine ? ` (${yoyLine})` : null}
                        </p>
                        {row.priorExpenses != null ? (
                          <p className="text-text-secondary">
                            שנה קודמת: <bdi dir="ltr">{formatIls(row.priorExpenses)}</bdi>
                          </p>
                        ) : null}
                        <p className="text-text-secondary">
                          מצטבר מתחילת השנה:{" "}
                          <bdi dir="ltr">{formatIls(row.currentExpensesYtd)}</bdi>
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ direction: "rtl" }}
                  formatter={(value: string) => (value === "currentExpenses" ? "השנה" : "שנה קודמת")}
                />
                <ReferenceLine
                  y={averageExpenses}
                  stroke="var(--text-muted)"
                  strokeDasharray="4 4"
                  label={{
                    value: averageLabel,
                    position: "insideTopRight",
                    fill: "var(--text-muted)",
                  }}
                />
                <Bar
                  dataKey="currentExpenses"
                  name="currentExpenses"
                  fill="var(--brand-blue-500)"
                  isAnimationActive={!reducedMotion}
                  className="cursor-pointer"
                  onClick={(bar) =>
                    handleBarClick((bar as { payload?: { currentPeriod?: string } }).payload?.currentPeriod)
                  }
                >
                  {yoyRows.map((row) => (
                    <Cell
                      key={row.currentPeriod}
                      fill={
                        selectedPeriod === row.currentPeriod
                          ? "var(--brand-orange-500)"
                          : "var(--brand-blue-500)"
                      }
                    />
                  ))}
                  <LabelList dataKey="currentExpenses" content={barLabel} />
                </Bar>
                {yoyEnabled ? (
                  <Bar
                    dataKey="priorExpenses"
                    name="priorExpenses"
                    fill="var(--text-muted)"
                    fillOpacity={0.45}
                    isAnimationActive={!reducedMotion}
                    className="cursor-pointer"
                  >
                    <LabelList dataKey="priorExpenses" content={barLabel} />
                  </Bar>
                ) : null}
              </BarChart>
            ) : null}

            {mode === "income-vs-expense" ? (
              <BarChart data={incomeExpenseData} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="monthLabel" />
                <YAxis tickFormatter={(value) => formatIls(Number(value))} width={72} />
                <Tooltip
                  content={({
                    active,
                    payload,
                    label,
                  }: {
                    active?: boolean;
                    payload?: ReadonlyArray<{ name?: string; value?: number; color?: string }>;
                    label?: string;
                  }) => {
                    if (!active || !payload?.length) return null;
                    const nameLabel = (name: string) =>
                      name === "expenses" ? "הוצאות" : name === "income" ? "הכנסות" : "נטו";
                    return (
                      <div
                        dir="rtl"
                        className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
                      >
                        <p className="font-medium text-text-primary">{label}</p>
                        {payload.map((entry) => (
                          <p key={String(entry.name)} className="text-text-secondary">
                            {nameLabel(String(entry.name))}:{" "}
                            <bdi dir="ltr">{formatIls(Number(entry.value))}</bdi>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ direction: "rtl" }}
                  formatter={(value: string) =>
                    value === "expenses" ? "הוצאות" : value === "income" ? "הכנסות" : "נטו"
                  }
                />
                <Bar
                  dataKey="income"
                  name="income"
                  fill={INCOME_CHART_COLORS[0]}
                  isAnimationActive={!reducedMotion}
                  className="cursor-pointer"
                  onClick={(bar) =>
                    handleBarClick((bar as { payload?: { period?: string } }).payload?.period)
                  }
                >
                  {incomeExpenseData.map((row) => (
                    <Cell
                      key={`income-${row.period}`}
                      fill={
                        selectedPeriod === row.period
                          ? "var(--brand-orange-500)"
                          : INCOME_CHART_COLORS[0]
                      }
                    />
                  ))}
                  <LabelList dataKey="income" content={barLabel} />
                </Bar>
                <Bar
                  dataKey="expenses"
                  name="expenses"
                  fill={chartColor(0)}
                  isAnimationActive={!reducedMotion}
                  className="cursor-pointer"
                  onClick={(bar) =>
                    handleBarClick((bar as { payload?: { period?: string } }).payload?.period)
                  }
                >
                  {incomeExpenseData.map((row) => (
                    <Cell
                      key={`expenses-${row.period}`}
                      fill={
                        selectedPeriod === row.period
                          ? "var(--brand-orange-500)"
                          : chartColor(0)
                      }
                    />
                  ))}
                  <LabelList dataKey="expenses" content={barLabel} />
                </Bar>
                <Line
                  type="monotone"
                  dataKey="net"
                  name="net"
                  stroke={chartColor(2)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reducedMotion}
                />
              </BarChart>
            ) : null}

            {mode === "by-category" ? (
              <BarChart data={categoryChart.data} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="period" tickFormatter={formatPeriod} />
                <YAxis tickFormatter={(value) => formatIls(Number(value))} width={72} />
                <Tooltip
                  content={({
                    active,
                    payload,
                    label,
                  }: {
                    active?: boolean;
                    payload?: ReadonlyArray<{ name?: string; value?: number; color?: string }>;
                    label?: string;
                  }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div
                        dir="rtl"
                        className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
                      >
                        <p className="font-medium text-text-primary">{formatPeriod(String(label))}</p>
                        {payload.map((entry) => (
                          <p key={String(entry.name)} className="text-text-secondary">
                            {String(entry.name)}:{" "}
                            <bdi dir="ltr">{formatIls(Number(entry.value))}</bdi>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ direction: "rtl" }} />
                {categoryChart.orderedKeys.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="expenses"
                    fill={chartColor(index)}
                    isAnimationActive={!reducedMotion}
                    className="cursor-pointer"
                    onClick={(barData) => {
                      const period = String(
                        (barData as { payload?: { period?: string } }).payload?.period ?? "",
                      );
                      handleBarClick(period);
                    }}
                  >
                    {categoryChart.data.map((row) => (
                      <Cell
                        key={`${key}-${String(row.period)}`}
                        fill={
                          selectedPeriod === String(row.period)
                            ? "var(--brand-orange-500)"
                            : chartColor(index)
                        }
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            ) : null}
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">לחצו על עמודה לפירוט החודש</p>
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:border-brand-blue-500/40"
        >
          {showTable ? "הסתר טבלה" : "טבלת נתונים"}
        </button>
      </div>

      {showTable && mode !== "by-category" ? (
        <div className="mt-4">
          <MonthlyBarsDataTable rows={yoyRows} mode={mode} showYoY={yoyEnabled} />
        </div>
      ) : null}
    </section>
  );
}

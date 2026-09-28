"use client";

/**
 * Principal vs interest stacked bars from amortization schedule rows.
 */
import type { LoanScheduleResponse } from "@moneytrack/contracts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import { chartColor } from "@/lib/chart-colors";

type LoanScheduleChartProps = {
  schedule: LoanScheduleResponse;
};

export function LoanScheduleChart({ schedule }: LoanScheduleChartProps) {
  const data = schedule.rows.map((row) => ({
    label: formatShortDate(row.dueDate),
    principal: row.principalPart,
    interest: row.interestPart,
  }));

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card p-4 shadow-soft" dir="ltr">
      <h3 className="mb-4 font-display text-sm font-semibold text-text-primary" dir="rtl">
        קרן מול ריבית
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
          <XAxis dataKey="label" reversed interval="preserveStartEnd" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          <Tooltip
            content={({
              active,
              payload,
              label,
            }: {
              active?: boolean;
              payload?: ReadonlyArray<{ name?: string; value?: number }>;
              label?: string;
            }) => {
              if (!active || !payload?.length) return null;
              return (
                <div
                  dir="rtl"
                  className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
                >
                  <p className="font-medium text-text-primary">תאריך: {label}</p>
                  {payload.map((entry) => (
                    <p key={String(entry.name)} className="text-text-secondary">
                      {entry.name === "principal" ? "קרן" : "ריבית"}:{" "}
                      <bdi dir="ltr">{formatIls(Number(entry.value))}</bdi>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Legend
            formatter={(value: string) => (value === "principal" ? "קרן" : "ריבית")}
            wrapperStyle={{ direction: "rtl" }}
          />
          <Bar dataKey="principal" stackId="payment" fill={chartColor(0)} name="principal" />
          <Bar dataKey="interest" stackId="payment" fill={chartColor(1)} name="interest" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

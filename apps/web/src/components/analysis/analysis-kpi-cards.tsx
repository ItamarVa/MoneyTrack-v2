"use client";

import type { AnalysisFilter, AnalysisSummaryResponse } from "@moneytrack/contracts";
import { useRouter } from "next/navigation";
import { drillDownToTransactionsUrl } from "@/lib/analysis-filter";
import { formatIls } from "@/lib/currency";

type AnalysisKpiCardsProps = {
  summary: AnalysisSummaryResponse | null;
  filter: AnalysisFilter;
  loading?: boolean;
};

type KpiCard = {
  label: string;
  value: number;
  tone: "expense" | "income" | "net";
  drillFilter: AnalysisFilter;
};

export function AnalysisKpiCards({ summary, filter, loading }: AnalysisKpiCardsProps) {
  const router = useRouter();

  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="h-28 animate-pulse rounded-card border border-border-subtle bg-surface-card"
          />
        ))}
      </div>
    );
  }

  const cards: KpiCard[] = [
    {
      label: "סה״כ הוצאות",
      value: summary.totalExpensesIls,
      tone: "expense",
      drillFilter: { ...filter, amountMax: -0.01 },
    },
    {
      label: "סה״כ הכנסות",
      value: summary.totalIncomeIls,
      tone: "income",
      drillFilter: { ...filter, amountMin: 0.01 },
    },
    {
      label: "נטו לתקופה",
      value: summary.netCashFlowIls,
      tone: "net",
      drillFilter: filter,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={() => router.push(drillDownToTransactionsUrl(card.drillFilter))}
          className="rounded-card border border-border-subtle bg-surface-card p-5 text-start shadow-sm transition hover:border-brand-blue-500/40 hover:shadow-md"
        >
          <p className="text-sm text-text-secondary">{card.label}</p>
          <p
            className={`mt-2 font-display text-2xl ${
              card.tone === "income"
                ? "text-brand-blue-500"
                : card.tone === "expense"
                  ? "text-text-primary"
                  : card.value >= 0
                    ? "text-brand-blue-500"
                    : "text-brand-orange-500"
            }`}
          >
            <bdi dir="ltr">{formatIls(card.value)}</bdi>
          </p>
          <p className="mt-2 text-xs text-text-muted">לחצו לפירוט עסקאות</p>
        </button>
      ))}
    </div>
  );
}

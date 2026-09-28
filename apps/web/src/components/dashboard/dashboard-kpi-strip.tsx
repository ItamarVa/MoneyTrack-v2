"use client";

/**
 * Dashboard KPI strip: net worth, net cash flow, expenses, savings rate with MoM deltas.
 */
import type { DashboardHomeResponse } from "@moneytrack/contracts";
import Link from "next/link";
import { formatIls } from "@/lib/currency";
import { formatPeriodChangePct, formatSavingsRate, savingsRate } from "./dashboard-utils";

type DashboardKpiStripProps = {
  data: DashboardHomeResponse;
};

type KpiTone = "positive" | "negative" | "neutral";

function changeTone(pct: number | null, invert = false): KpiTone {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "neutral";
  const favorable = invert ? pct < 0 : pct > 0;
  return favorable ? "positive" : "negative";
}

function toneClass(tone: KpiTone): string {
  if (tone === "positive") return "text-brand-blue-500";
  if (tone === "negative") return "text-brand-orange-500";
  return "text-text-muted";
}

type KpiCard = {
  label: string;
  value: string;
  changePct: number | null;
  invertChange?: boolean;
  href: string;
  valueTone?: KpiTone;
};

export function DashboardKpiStrip({ data }: DashboardKpiStripProps) {
  const prev = data.previousPeriod;
  const currentSavings = data.savingsRate;
  const previousSavings = savingsRate(prev.netCashFlowIls, prev.totalIncomeIls);

  let savingsRateChangePct: number | null = null;
  if (currentSavings != null && previousSavings != null && previousSavings !== 0) {
    savingsRateChangePct = ((currentSavings - previousSavings) / Math.abs(previousSavings)) * 100;
  } else if (currentSavings != null && previousSavings === 0 && currentSavings !== 0) {
    savingsRateChangePct = 100;
  }

  const cards: KpiCard[] = [
    {
      label: "שווי נקי",
      value: data.netWorthIls != null ? formatIls(data.netWorthIls) : "—",
      changePct: prev.netWorthChangePct,
      href: "/networth",
    },
    {
      label: `נטו — ${data.periodLabel}`,
      value: formatIls(data.netCashFlowIls),
      changePct: prev.netChangePct,
      href: "/analysis",
      valueTone: data.netCashFlowIls >= 0 ? "positive" : "negative",
    },
    {
      label: `הוצאות — ${data.periodLabel}`,
      value: formatIls(data.totalExpensesIls),
      changePct: prev.expensesChangePct,
      invertChange: true,
      href: "/analysis",
    },
    {
      label: "שיעור חיסכון",
      value: formatSavingsRate(currentSavings),
      changePct: savingsRateChangePct,
      href: "/analysis",
      valueTone:
        currentSavings != null && currentSavings >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const deltaTone = changeTone(card.changePct, card.invertChange);
        return (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-sm transition hover:border-brand-blue-500/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-blue-500"
          >
            <p className="text-sm text-text-secondary">{card.label}</p>
            <p
              className={[
                "mt-2 font-display text-2xl",
                card.valueTone ? toneClass(card.valueTone) : "text-text-primary",
              ].join(" ")}
            >
              <bdi dir="ltr">{card.value}</bdi>
            </p>
            <p className={["mt-2 text-xs", toneClass(deltaTone)].join(" ")}>
              {formatPeriodChangePct(card.changePct)}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

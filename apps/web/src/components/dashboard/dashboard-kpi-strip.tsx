"use client";

/**
 * Dashboard KPI strip: net worth, net cash flow, expenses, savings rate with MoM deltas (hidden in the all-period view, where there is no previous month).
 */
import Link from "next/link";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import type { DashboardHome } from "./dashboard-home-types";
import {
  formatPeriodChangePct,
  formatSavingsRate,
  savingsRate,
  type MonthDataState,
} from "./dashboard-utils";

type DashboardKpiStripProps = {
  data: DashboardHome;
  /** "partial" swaps month-over-month percentages for an "so far" note. */
  monthState?: MonthDataState;
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
  /** Net worth compares snapshots, not months, so it stays comparable mid-month. */
  monthBased?: boolean;
  /** Small caveat under the value; the whole card already links to the detail page. */
  hint?: string;
};

export function DashboardKpiStrip({ data, monthState = "complete" }: DashboardKpiStripProps) {
  const prev = data.previousPeriod;
  const currentSavings = data.savingsRate;
  const previousSavings = savingsRate(prev.netCashFlowIls, prev.totalIncomeIls);

  let savingsRateChangePct: number | null = null;
  if (currentSavings != null && previousSavings != null && previousSavings !== 0) {
    savingsRateChangePct = ((currentSavings - previousSavings) / Math.abs(previousSavings)) * 100;
  } else if (currentSavings != null && previousSavings === 0 && currentSavings !== 0) {
    savingsRateChangePct = 100;
  }

  const isAll = monthState === "all";
  const cards: KpiCard[] = [
    {
      label: "שווי נקי",
      value: data.netWorthIls != null ? formatIls(data.netWorthIls) : "—",
      changePct: prev.netWorthChangePct,
      href: "/networth",
      hint: data.netWorthPartial ? he.homeUx.netWorthPartial : undefined,
    },
    {
      label: `נטו — ${data.periodLabel}`,
      value: formatIls(data.netCashFlowIls),
      changePct: prev.netChangePct,
      monthBased: true,
      href: "/analysis",
      valueTone: data.netCashFlowIls >= 0 ? "positive" : "negative",
    },
    {
      label: `הוצאות — ${data.periodLabel}`,
      value: formatIls(data.totalExpensesIls),
      changePct: prev.expensesChangePct,
      invertChange: true,
      monthBased: true,
      href: "/analysis",
    },
    {
      label: isAll ? `שיעור חיסכון — ${data.periodLabel}` : "שיעור חיסכון",
      value: formatSavingsRate(currentSavings),
      changePct: savingsRateChangePct,
      monthBased: true,
      href: "/analysis",
      valueTone:
        currentSavings != null && currentSavings >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {cards.map((card) => {
        const partial = monthState === "partial" && card.monthBased;
        const deltaTone = partial ? "neutral" : changeTone(card.changePct, card.invertChange);
        return (
          <Link
            key={card.label}
            href={card.href}
            className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-3 shadow-sm transition hover:border-brand-blue-500/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-blue-500 sm:p-5"
          >
            <p className="text-xs leading-snug text-text-secondary sm:text-sm">{card.label}</p>
            <p
              className={[
                "mt-1 font-display text-lg sm:mt-2 sm:text-2xl",
                card.valueTone ? toneClass(card.valueTone) : "text-text-primary",
              ].join(" ")}
            >
              <bdi dir="ltr">{card.value}</bdi>
            </p>
            {card.hint ? (
              <p className="mt-1 text-[11px] leading-snug text-brand-orange-500 sm:text-xs">{card.hint}</p>
            ) : null}
            {isAll ? null : (
              <p className={["mt-1 text-[11px] leading-snug sm:mt-2 sm:text-xs", toneClass(deltaTone)].join(" ")}>
                {partial ? he.dashboardUx.partialMonth : formatPeriodChangePct(card.changePct)}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}

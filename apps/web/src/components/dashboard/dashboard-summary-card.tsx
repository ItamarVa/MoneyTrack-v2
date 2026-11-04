"use client";

/**
 * Top-of-dashboard summary: one plain sentence plus the two facts a person asks first —
 * where the money went (top 3 categories) and when the card is billed next.
 * Month view compares with the "usual month"; the all-period view shows a monthly average.
 * Skipped by the page for an empty month, so it never prints a bogus "0 ₪" sentence.
 */
import Link from "next/link";
import { formatIls } from "@/lib/currency";
import { entityDetailUrl } from "@/lib/analysis-filter";
import { entityIdForCategorySlice } from "@/lib/category-ids";
import he from "@/locales/he.json";
import type { DashboardHome } from "./dashboard-home-types";
import {
  allHistorySentence,
  monthSummarySentence,
  nextCardChargeSentence,
  usualMonthNote,
  type MonthDataState,
  type NextCardCharge,
} from "./dashboard-utils";

type DashboardSummaryCardProps = {
  data: DashboardHome;
  monthState: MonthDataState;
  period: string;
  /** Null while loading, when the credit call failed, or when no charge is upcoming. */
  nextCharge: NextCardCharge | null;
};

export function DashboardSummaryCard({
  data,
  monthState,
  period,
  nextCharge,
}: DashboardSummaryCardProps) {
  const isAll = monthState === "all";
  const sentence = isAll
    ? allHistorySentence(data.monthlySeries)
    : monthSummarySentence({
        spentIls: data.totalExpensesIls,
        periodLabel: data.periodLabel,
        inProgress: monthState === "partial",
        usualMonth: data.usualMonth,
      });
  if (!sentence) return null;

  const note = !isAll && data.usualMonth ? usualMonthNote(data.usualMonth) : null;

  return (
    <section
      aria-label={data.periodLabel}
      className="rounded-card border border-border-subtle bg-surface-card p-4 sm:p-5"
    >
      <p className="font-display text-lg leading-snug text-text-primary sm:text-xl">{sentence}</p>
      {note ? <p className="mt-1 text-xs leading-snug text-text-muted">{note}</p> : null}

      {data.topCategories.length > 0 ? (
        <div className="mt-3">
          <h2 className="text-sm text-text-secondary">{he.homeUx.summary.topCategories}</h2>
          <ul className="mt-1 divide-y divide-border-subtle">
            {data.topCategories.map((row) => {
              const entityId = entityIdForCategorySlice("category", row.categoryId);
              const content = (
                <>
                  <span className="min-w-0 truncate text-sm text-text-primary">{row.categoryName}</span>
                  <span className="shrink-0 text-sm text-text-secondary">
                    <bdi dir="ltr">{formatIls(row.amountIls)}</bdi>
                  </span>
                </>
              );
              const rowClass = "flex min-h-11 items-center justify-between gap-3";
              return (
                <li key={row.categoryId ?? "uncategorized"}>
                  {entityId ? (
                    <Link
                      href={entityDetailUrl("category", entityId, period)}
                      className={`${rowClass} hover:text-brand-blue-500 focus-visible:outline-2 focus-visible:outline-brand-blue-500`}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={rowClass}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {nextCharge ? (
        <Link
          href="/credit"
          className="mt-2 flex min-h-11 items-center border-t border-border-subtle pt-2 text-sm text-brand-blue-500 hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue-500"
        >
          {nextCardChargeSentence(nextCharge)}
        </Link>
      ) : null}
    </section>
  );
}

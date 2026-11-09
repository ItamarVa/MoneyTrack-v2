"use client";

/**
 * Compact read-only budget summary for /analysis. Follows the page's selected month (the
 * global period) instead of owning a month picker; management lives in settings.
 * `period` is YYYY-MM; anything else (e.g. "all") falls back to the current month.
 */
import type { BudgetWithVariance } from "@moneytrack/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { fetchBudgets } from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { budgetUsagePct } from "./budget-progress";
import { BudgetProgressBar } from "./budget-progress-bar";

const MAX_ROWS = 5;

function resolvePeriod(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return period;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetSummary({ period }: { period: string }) {
  const text = he.budgetsUx;
  const month = resolvePeriod(period);
  const [all, setAll] = useState<BudgetWithVariance[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBudgets()
      .then((rows) => {
        if (!cancelled) setAll(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = (all ?? [])
    .filter((row) => row.period === month)
    .sort((a, b) => budgetUsagePct(b.actualIls, b.amount) - budgetUsagePct(a.actualIls, a.amount));

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-text-primary">
          {fillTemplate(text.summary.title, { month: formatMonthYear(month) })}
        </h2>
        <Link
          href="/settings?tab=budgets"
          className="inline-flex min-h-11 items-center text-sm text-brand-blue-500 hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue-500"
        >
          {text.manageLink}
        </Link>
      </div>

      {failed ? (
        <p className="mt-2 text-sm text-brand-orange-500">{text.summary.loadError}</p>
      ) : all === null ? null : rows.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{text.summary.empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.slice(0, MAX_ROWS).map((budget) => (
            <li key={budget.id} className="rounded-lg bg-surface-elevated px-3 py-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{budget.categoryName}</span>
                <span className="shrink-0 text-text-secondary">
                  <bdi dir="ltr">
                    {formatIls(budget.actualIls)} / {formatIls(budget.amount)}
                  </bdi>
                </span>
              </div>
              <BudgetProgressBar budget={budget} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

/**
 * Read-only top budget progress bars for the dashboard main row.
 */
import type { DashboardBudgetSummary } from "@moneytrack/contracts";
import Link from "next/link";
import { formatIls } from "@/lib/currency";

type DashboardBudgetBarsProps = {
  budgets: DashboardBudgetSummary[];
};

function progressTone(pct: number): string {
  if (pct >= 100) return "bg-brand-orange-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-brand-blue-500";
}

export function DashboardBudgetBars({ budgets }: DashboardBudgetBarsProps) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-text-primary">תקציבים</h2>
        <Link href="/analysis" className="text-sm text-brand-blue-500 hover:underline">
          כל התקציבים
        </Link>
      </div>

      {budgets.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-8 text-center text-sm text-text-muted">
          אין תקציבים לחודש הנוכחי
        </p>
      ) : (
        <ul className="space-y-3">
          {budgets.map((budget) => {
            const usagePct =
              budget.amount > 0
                ? Math.min(150, Math.round((budget.actualIls / budget.amount) * 100))
                : 0;

            return (
              <li key={budget.id} className="rounded-lg bg-surface-elevated px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{budget.categoryName}</span>
                  <span className="text-text-secondary">
                    <bdi dir="ltr">
                      {formatIls(budget.actualIls)} / {formatIls(budget.amount)}
                    </bdi>
                  </span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-bg">
                  {usagePct > 100 ? (
                    <>
                      <div
                        className="h-full bg-brand-orange-500 transition-all"
                        style={{ width: `${(100 / usagePct) * 100}%` }}
                      />
                      <div
                        className="h-full bg-brand-orange-700 transition-all"
                        style={{ width: `${((usagePct - 100) / usagePct) * 100}%` }}
                      />
                    </>
                  ) : (
                    <div
                      className={["h-full rounded-full transition-all", progressTone(usagePct)].join(" ")}
                      style={{ width: `${usagePct}%` }}
                    />
                  )}
                </div>
                {budget.variancePct > 0 ? (
                  <p className="mt-1 text-xs text-brand-orange-500">
                    חריגה של {Math.round(budget.variancePct)}%
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

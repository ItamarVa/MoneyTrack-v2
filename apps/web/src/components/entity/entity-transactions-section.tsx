"use client";

/**
 * Recent transactions for the selected entity and month. Drill-step chips narrow
 * the list; rows open the transaction detail drawer.
 */
import type { AnalysisFilter, Transaction } from "@moneytrack/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { drillDownToTransactionsUrl } from "@/lib/analysis-filter";
import { fetchTransactions } from "@/lib/api-client";
import { formatIlsExact } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import { drillFilter } from "./entity-dimension";
import type { EntityDrillStep } from "./entity-types";

type EntityTransactionsSectionProps = {
  filter: AnalysisFilter;
  steps: EntityDrillStep[];
  onStepsChange: (steps: EntityDrillStep[]) => void;
  onRowClick: (transactionId: string) => void;
  reloadToken?: number;
};

export function EntityTransactionsSection({
  filter,
  steps,
  onStepsChange,
  onRowClick,
  reloadToken = 0,
}: EntityTransactionsSectionProps) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listFilter = useMemo(() => drillFilter(filter, steps), [filter, steps]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchTransactions(listFilter, 50)
      .then((items) => {
        if (!cancelled) setRows(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינת עסקאות");
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [listFilter, reloadToken]);

  if (error) {
    return (
      <section className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="text-sm text-brand-orange-500">{error}</p>
      </section>
    );
  }

  return (
    <section
      aria-label="עסקאות בחודש"
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-text-primary">עסקאות בחודש</h2>
        {steps.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((step, index) => (
              <span
                key={`${step.dimension}-${step.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-brand-blue-500/40 bg-brand-blue-500/10 px-3 py-1 text-sm text-brand-blue-500"
              >
                {step.name}
                <button
                  type="button"
                  aria-label={`הסרת סינון ${step.name}`}
                  onClick={() => onStepsChange(steps.slice(0, index))}
                  className="ms-1 rounded-full px-1 leading-none hover:bg-brand-blue-500/20"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {loading && rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border-subtle px-4 py-10 text-center text-sm text-text-muted">
          טוען עסקאות…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border-subtle px-4 py-10 text-center text-sm text-text-muted">
          אין עסקאות לתקופה שנבחרה
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onRowClick(row.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-surface-elevated"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{row.descriptionNormalized}</p>
                    <p className="text-xs text-text-muted">{formatShortDate(row.transactionDate)}</p>
                  </div>
                  <span className="shrink-0 text-sm text-text-secondary">
                    <bdi dir="ltr">{formatIlsExact(row.amountIls)}</bdi>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            href={drillDownToTransactionsUrl(listFilter)}
            className="inline-flex text-sm text-brand-blue-500 hover:underline"
          >
            צפייה בכל העסקאות
          </Link>
        </div>
      )}
    </section>
  );
}

"use client";

/**
 * Recent transactions list for the dashboard support row.
 */
import type { DashboardRecentTransaction } from "@moneytrack/contracts";
import Link from "next/link";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";

type DashboardRecentTransactionsProps = {
  transactions: DashboardRecentTransaction[];
};

export function DashboardRecentTransactions({ transactions }: DashboardRecentTransactionsProps) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-text-primary">עסקאות אחרונות</h2>
        <Link href="/transactions" className="text-sm text-brand-blue-500 hover:underline">
          כל העסקאות
        </Link>
      </div>

      {transactions.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-8 text-center text-sm text-text-muted">
          אין עסקאות עדיין
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {transactions.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{row.descriptionNormalized}</p>
                <p className="text-xs text-text-muted">
                  {formatShortDate(row.transactionDate)}
                  {row.categoryName ? ` · ${row.categoryName}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm text-text-secondary">
                <bdi dir="ltr">{formatIls(row.amountIls)}</bdi>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

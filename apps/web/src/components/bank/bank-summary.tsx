"use client";

/**
 * Header summary for the chosen bank account and period: money in, money out, net, and the last
 * known balance (accounts.balanceIls / balanceDate, not period-bound). Totals come from every row
 * of the period, loaded separately from the paged list below. `reloadKey` refetches after an edit.
 */
import type { Account, AnalysisFilter } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { formatShortDate } from "@/lib/dates";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { fetchAllPeriodRows } from "./bank-api";
import { summarizeRows, type BankSummary } from "./bank-utils";

const copy = he.bankPage;

type BankSummaryProps = { account: Account; filter: AnalysisFilter; reloadKey: number };

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary md:text-xl">
        <bdi dir="ltr" className={tone}>
          {value}
        </bdi>
      </dd>
    </div>
  );
}

export function BankSummaryCard({ account, filter, reloadKey }: BankSummaryProps) {
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setFailed(false);
    void fetchAllPeriodRows(filter).then(
      (rows) => {
        if (!cancelled) setSummary(summarizeRows(rows));
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // filter is represented by filterKey; reloadKey forces a refetch.
  }, [filterKey, reloadKey]);

  const balance =
    account.balanceIls === null ? copy.balanceUnknown : formatIls(account.balanceIls);
  const dash = "—";

  return (
    <section
      aria-label={copy.summaryLabel}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
        <Figure
          label={copy.moneyIn}
          value={summary ? formatIls(summary.moneyIn) : dash}
          tone="text-brand-green-500"
        />
        <Figure label={copy.moneyOut} value={summary ? formatIls(summary.moneyOut) : dash} />
        <Figure label={copy.net} value={summary ? formatIls(summary.net) : dash} />
        <Figure label={copy.balance} value={balance} />
      </dl>
      {account.balanceIls !== null && account.balanceDate ? (
        <p className="mt-3 text-xs text-text-muted">
          {fillTemplate(copy.balanceAsOf, { date: formatShortDate(account.balanceDate) })}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-3 text-xs text-brand-orange-500">
          {copy.loadFailed}
        </p>
      ) : null}
    </section>
  );
}

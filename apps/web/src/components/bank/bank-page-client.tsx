"use client";

/**
 * Bank page: all activity of one household bank account for the global header period.
 * Account picker (choice remembered for the session), period summary, searchable paged list.
 * Always filters by transaction date (see bankFilter), independent of the app-wide date basis.
 * Card bills (kind card_settlement) show here as money out but are not categorizable (see
 * card-settlement-lock.tsx); their detail is on /credit.
 */
import type { Account, Category } from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { fillTemplate } from "@/components/category/category-options";
import { useScreenPeriod } from "@/components/period/use-screen-period";
import { SkeletonPanel } from "@/components/ui/skeleton";
import { fetchAccounts, fetchCategories } from "@/lib/api-client";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { BankSummaryCard } from "./bank-summary";
import { BankTransactions } from "./bank-transactions";
import { bankAccountLabel, bankAccounts, bankFilter, pickDefaultAccountId } from "./bank-utils";

const copy = he.bankPage;
const STORAGE_KEY = "moneytrack.bank.accountId";

function readStoredAccountId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeAccountId(id: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Remembering the pick is a convenience only.
  }
}

export function BankPageClient() {
  const { period, ready } = useScreenPeriod(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [summaryKey, setSummaryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([fetchAccounts(), fetchCategories()]).then(
      ([all, cats]) => {
        if (cancelled) return;
        const banks = bankAccounts(all);
        setAccounts(banks);
        setCategories(cats);
        setSelectedId(pickDefaultAccountId(banks, readStoredAccountId()));
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : copy.loadFailed);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const account = accounts?.find((row) => row.id === selectedId) ?? null;
  const filter = useMemo(
    () => (selectedId ? bankFilter(period, selectedId) : null),
    [period, selectedId],
  );

  const title = <h1 className="font-display text-2xl text-text-primary md:text-3xl">{copy.title}</h1>;

  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        {title}
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/5 px-4 py-3 text-sm text-brand-orange-500"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="min-h-11 rounded-lg border border-brand-orange-500/40 px-4 font-medium"
          >
            {copy.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!accounts || !ready) {
    return (
      <div className="min-w-0 space-y-6">
        {title}
        <SkeletonPanel lines={3} />
        <SkeletonPanel lines={6} />
      </div>
    );
  }

  if (accounts.length === 0 || !account || !filter) {
    return (
      <div className="min-w-0 space-y-6">
        {title}
        <EmptyState title={copy.noAccountsTitle} description={copy.noAccountsDescription} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        {title}
        <p className="mt-1 text-sm text-text-muted">
          {fillTemplate(copy.subtitle, { account: bankAccountLabel(account), period: formatMonthYear(period) })}
        </p>
      </div>

      {accounts.length > 1 ? (
        <label className="block text-sm text-text-secondary">
          <span className="mb-1 block">{copy.accountPickerLabel}</span>
          <select
            value={account.id}
            onChange={(event) => {
              setSelectedId(event.target.value);
              storeAccountId(event.target.value);
            }}
            className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-base text-text-primary sm:w-72"
          >
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {bankAccountLabel(row)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <BankSummaryCard account={account} filter={filter} reloadKey={summaryKey} />
      <BankTransactions
        filter={filter}
        categories={categories}
        onChanged={() => setSummaryKey((key) => key + 1)}
      />
    </div>
  );
}

"use client";

/**
 * Accounts page: one detailed card per account, period-aware via the global picker.
 * Connection settings, sync and statement upload moved to Settings (connections tab); only a link
 * remains here. Per-account activity is fetched with one transactions call per account over the
 * 6-month trend window (API max 500 rows).
 * ponytail: an account with more than 500 rows in 6 months under-counts; upgrade path is a
 * server-side per-account aggregate route.
 */
import type { Account, Person } from "@moneytrack/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountPatch, SummaryState } from "@/components/accounts/account-card";
import { summarizeAccount, trendWindow } from "@/components/accounts/account-summary";
import { AddAccountForm } from "@/components/accounts/add-account-form";
import { ManualAccountsSection } from "@/components/accounts/manual-accounts-section";
import { ScrapedAccountsSection } from "@/components/accounts/scraped-accounts-section";
import { ALL_PERIOD, currentMonthPeriod, useGlobalPeriod } from "@/components/period/period-context";
import { SkeletonPanel } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  createAccount,
  fetchAccounts,
  fetchPeople,
  fetchTransactions,
  updateAccount,
} from "@/lib/api-client";
import he from "@/locales/he.json";

export function AccountsPageClient() {
  const { period, hydrated } = useGlobalPeriod();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const wholeWindow = period === ALL_PERIOD;
  const endPeriod = wholeWindow ? currentMonthPeriod() : period;

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [acc, ppl] = await Promise.all([fetchAccounts(), fetchPeople().catch(() => [] as Person[])]);
      setAccounts(acc);
      setPeople(ppl);
    } catch (err) {
      setError(err instanceof Error ? err.message : he.accounts.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const accountIdsKey = accountIds.join(",");

  useEffect(() => {
    if (!hydrated || accountIdsKey === "") {
      return;
    }
    let cancelled = false;
    const bounds = trendWindow(endPeriod);
    setSummaries({});
    for (const id of accountIdsKey.split(",")) {
      fetchTransactions({ accountIds: [id], accountScope: "all", ...bounds }, 500)
        .then((txns): SummaryState => ({ status: "ready", summary: summarizeAccount(txns, endPeriod, wholeWindow) }))
        .catch((): SummaryState => ({ status: "error" }))
        .then((state) => {
          if (!cancelled) setSummaries((prev) => ({ ...prev, [id]: state }));
        });
    }
    return () => {
      cancelled = true;
    };
    // Keyed by the id list, not the accounts: a rename must not refetch every card.
  }, [hydrated, accountIdsKey, endPeriod, wholeWindow]);

  async function handleUpdate(account: Account, patch: AccountPatch): Promise<boolean> {
    setBusyId(account.id);
    try {
      await updateAccount(account.id, patch);
      showToast(he.accounts.saved, "success");
      await reload();
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : he.accounts.updateError, "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function addManualAccount(code: string, label: string) {
    try {
      await createAccount({ kind: "cash", institutionCode: code, displayName: label, currency: "ILS" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : he.accounts.createError);
    }
  }

  const sectionProps = { accounts, people, summaries, wholeWindow, busyId, onUpdate: handleUpdate };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-text-primary">{he.accounts.title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{he.accounts.subtitle}</p>
        <p className="mt-2 text-sm text-text-secondary">
          {he.accounts.connectionsMoved}{" "}
          <Link href="/settings?tab=connections" className="font-medium text-brand-blue-500 underline">
            {he.accounts.connectionsLink}
          </Link>
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-brand-orange-500">
          {error}
        </p>
      ) : null}

      {loading ? (
        <SkeletonPanel lines={4} />
      ) : (
        <>
          <ScrapedAccountsSection {...sectionProps} />
          <ManualAccountsSection {...sectionProps} />
          <AddAccountForm
            onCreated={() => void reload()}
            existingManualCodes={accounts.filter((a) => a.kind === "cash").map((a) => a.institutionCode)}
            onQuickAdd={(code, label) => void addManualAccount(code, label)}
          />
        </>
      )}
    </div>
  );
}

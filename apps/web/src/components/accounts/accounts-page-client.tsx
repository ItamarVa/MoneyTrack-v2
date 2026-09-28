"use client";

import type {
  Account,
  Connection,
  Job,
  ProviderCatalogEntry,
} from "@moneytrack/contracts";
import { useCallback, useEffect, useState } from "react";
import { AddAccountForm } from "@/components/accounts/add-account-form";
import { ConnectionsSection } from "@/components/accounts/connections-section";
import { ManualAccountsSection } from "@/components/accounts/manual-accounts-section";
import { ScrapedAccountsSection } from "@/components/accounts/scraped-accounts-section";
import { SkeletonPanel } from "@/components/ui/skeleton";
import {
  createAccount,
  fetchAccounts,
  fetchConnections,
  fetchProviders,
  fetchSyncJobs,
  startSync,
} from "@/lib/api-client";

export function AccountsPageClient() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [otpJob, setOtpJob] = useState<Job | null>(null);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [acc, conn, syncJobs, providerList] = await Promise.all([
        fetchAccounts(),
        fetchConnections(),
        fetchSyncJobs(),
        fetchProviders(),
      ]);
      setAccounts(acc);
      setConnections(conn);
      setJobs(syncJobs);
      setProviders(providerList);

      const pendingOtp = syncJobs.find((j) => j.status === "otp_required");
      if (pendingOtp) {
        setOtpJob(pendingOtp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function addManualAccount(code: string, label: string) {
    try {
      await createAccount({
        kind: "cash",
        institutionCode: code,
        displayName: label,
        currency: "ILS",
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת חשבון");
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId);
    try {
      const job = await startSync(connectionId);
      if (job.status === "otp_required") {
        setOtpJob(job);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בסנכרון");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-text-primary">חשבונות וחיבורים</h1>
        <p className="mt-2 text-sm text-text-secondary">
          חשבונות ידניים, חיבורים לסנכרון בנק, וטופס הוספת חשבון
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
          <ScrapedAccountsSection accounts={accounts} onChanged={() => void reload()} />
          <ManualAccountsSection accounts={accounts} onAddManual={(code, label) => void addManualAccount(code, label)} />
          <ConnectionsSection
            connections={connections}
            jobs={jobs}
            providers={providers}
            syncingId={syncingId}
            otpJob={otpJob}
            connectionModalOpen={connectionModalOpen}
            editingConnection={editingConnection}
            onOpenConnectionModal={(connection) => {
              setEditingConnection(connection);
              setConnectionModalOpen(true);
            }}
            onCloseConnectionModal={() => {
              setConnectionModalOpen(false);
              setEditingConnection(null);
            }}
            onSync={(connectionId) => void handleSync(connectionId)}
            onSaved={() => void reload()}
            onOtpClose={() => setOtpJob(null)}
            onOtpOpen={setOtpJob}
          />
          <AddAccountForm onCreated={() => void reload()} />
        </>
      )}
    </div>
  );
}

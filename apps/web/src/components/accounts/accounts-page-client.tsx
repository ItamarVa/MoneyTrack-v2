"use client";

import type {
  Account,
  Connection,
  Job,
  ProviderCatalogEntry,
} from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { liveConnectionIds, selectNeedsAction } from "@/components/accounts/accounts-needs-action";
import { AddAccountForm } from "@/components/accounts/add-account-form";
import { ConnectionsSection } from "@/components/accounts/connections-section";
import { ManualAccountsSection } from "@/components/accounts/manual-accounts-section";
import { NeedsActionBlock } from "@/components/accounts/needs-action-block";
import { ScrapedAccountsSection } from "@/components/accounts/scraped-accounts-section";
import { fetchAutoSyncState, type SyncConnectionState } from "@/components/sync/auto-sync-api";
import { SkeletonPanel } from "@/components/ui/skeleton";
import {
  createAccount,
  fetchAccounts,
  fetchConnections,
  fetchProviders,
  fetchSyncJobs,
  startSync,
} from "@/lib/api-client";

const POLL_MS = 5000;
// A stuck job must not keep this page polling forever; same ceiling as the on-open auto sync.
const MAX_POLL_MS = 10 * 60 * 1000;

export function AccountsPageClient() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [syncStates, setSyncStates] = useState<SyncConnectionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [otpJob, setOtpJob] = useState<Job | null>(null);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [acc, conn, syncJobs, providerList, autoState] = await Promise.all([
        fetchAccounts(),
        fetchConnections(),
        fetchSyncJobs(),
        fetchProviders(),
        // ponytail: the state endpoint only adds failure reasons; without it the page still works
        fetchAutoSyncState().catch(() => ({ connections: [] as SyncConnectionState[] })),
      ]);
      setAccounts(acc);
      setConnections(conn);
      setJobs(syncJobs);
      setProviders(providerList);
      setSyncStates(autoState.connections);

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

  const liveIds = useMemo(
    () => liveConnectionIds(syncStates, jobs, syncingId),
    [syncStates, jobs, syncingId],
  );
  const needsAction = useMemo(
    () => selectNeedsAction(connections, syncStates, liveIds),
    [connections, syncStates, liveIds],
  );
  const anyLive = liveIds.size > 0;

  // Poll while a job runs so status updates without a manual refresh; stops when none is live.
  useEffect(() => {
    if (!anyLive) {
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(timer);
        return;
      }
      void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [anyLive, reload]);

  function openCredentials(connection: Connection | null) {
    setEditingConnection(connection);
    setConnectionModalOpen(true);
  }

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
          מה דורש טיפול, חיבורים לבנק ולאשראי, וחשבונות
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
          <NeedsActionBlock
            items={needsAction}
            connections={connections}
            onEnterCredentials={openCredentials}
            onSync={(connectionId) => void handleSync(connectionId)}
          />
          <ConnectionsSection
            connections={connections}
            jobs={jobs}
            providers={providers}
            syncStates={syncStates}
            liveIds={liveIds}
            otpJob={otpJob}
            connectionModalOpen={connectionModalOpen}
            editingConnection={editingConnection}
            onOpenConnectionModal={openCredentials}
            onCloseConnectionModal={() => {
              setConnectionModalOpen(false);
              setEditingConnection(null);
            }}
            onSync={(connectionId) => void handleSync(connectionId)}
            onSaved={() => void reload()}
            onOtpClose={() => setOtpJob(null)}
            onOtpOpen={setOtpJob}
          />
          <ScrapedAccountsSection accounts={accounts} onChanged={() => void reload()} />
          <ManualAccountsSection accounts={accounts} />
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

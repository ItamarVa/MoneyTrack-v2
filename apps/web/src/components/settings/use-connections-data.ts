/**
 * Loads and mutates bank/card connection data for the Settings "connections" tab.
 * Extracted from the accounts page client so both screens show the same live state
 * (polls while a sync job runs; capped so a stuck job cannot poll forever).
 * Used by: connections-panel.tsx.
 */
import type { Connection, Job, ProviderCatalogEntry } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { liveConnectionIds, selectNeedsAction } from "@/components/accounts/accounts-needs-action";
import { fetchAutoSyncState, type SyncConnectionState } from "@/components/sync/auto-sync-api";
import { fetchConnections, fetchProviders, fetchSyncJobs, startSync } from "@/lib/api-client";
import he from "@/locales/he.json";

const POLL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;

export function useConnectionsData() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [syncStates, setSyncStates] = useState<SyncConnectionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [otpJob, setOtpJob] = useState<Job | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [conn, syncJobs, providerList, autoState] = await Promise.all([
        fetchConnections(),
        fetchSyncJobs(),
        fetchProviders(),
        // The state endpoint only adds failure reasons; without it the panel still works.
        fetchAutoSyncState().catch(() => ({ connections: [] as SyncConnectionState[] })),
      ]);
      setConnections(conn);
      setJobs(syncJobs);
      setProviders(providerList);
      setSyncStates(autoState.connections);
      const pendingOtp = syncJobs.find((j) => j.status === "otp_required");
      if (pendingOtp) setOtpJob(pendingOtp);
    } catch (err) {
      setError(err instanceof Error ? err.message : he.settingsShell.loadError);
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

  useEffect(() => {
    if (!anyLive) return;
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

  const sync = useCallback(
    async (connectionId: string) => {
      setSyncingId(connectionId);
      try {
        const job = await startSync(connectionId);
        if (job.status === "otp_required") setOtpJob(job);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : he.settingsShell.syncError);
      } finally {
        setSyncingId(null);
      }
    },
    [reload],
  );

  return {
    connections,
    jobs,
    providers,
    syncStates,
    loading,
    error,
    liveIds,
    needsAction,
    otpJob,
    setOtpJob,
    reload,
    sync,
  };
}

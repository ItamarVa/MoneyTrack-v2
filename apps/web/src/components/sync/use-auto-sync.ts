"use client";

/**
 * On-open auto sync for the app shell: loads connections, and once per browser session asks
 * POST /api/sync/auto to sync when something is older than 24h; then polls until jobs finish,
 * reloads the page data and exposes what the banner must show (running providers, problems, "updated").
 * Gotchas: the server owns the lockout guards (20h per connection, live job, credentials), so a
 * call here can safely start nothing. Polling stops when no job is live and after 10 minutes.
 * Page data lives in client-side fetches, so a successful sync reloads the page (when no field has
 * focus) instead of router.refresh(). Used by stale-data-banner.tsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Connection } from "@moneytrack/contracts";
import {
  fetchAutoSyncState,
  startAutoSync,
  type SyncConnectionState,
} from "@/components/sync/auto-sync-api";
import {
  buildProblems,
  needsAutoSync,
  type AutoSyncProblem,
} from "@/components/sync/auto-sync-rules";
import { fetchConnections } from "@/lib/api-client";
import { providerLabel } from "@/lib/provider-labels";

const STARTED_KEY = "mt-auto-sync-started";
const UPDATED_KEY = "mt-auto-sync-updated";
const POLL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;
const UPDATED_VISIBLE_MS = 6000;

export type AutoSyncView = {
  connections: Connection[] | null;
  /** Hebrew provider names with a live job. */
  running: string[];
  problems: AutoSyncProblem[];
  updated: boolean;
  /** Sync finished but the page was not reloaded because a field has focus. */
  reloadPending: boolean;
};

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) {
      sessionStorage.setItem(key, "1");
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // storage blocked: worst case the check repeats on the next open, the server guards still hold
  }
}

function fieldHasFocus(): boolean {
  const el = document.activeElement;
  if (!el) {
    return false;
  }
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el as HTMLElement).isContentEditable
  );
}

export function useAutoSync(pathname: string): AutoSyncView & { reload: () => void } {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [states, setStates] = useState<SyncConnectionState[]>([]);
  const [updated, setUpdated] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const mountedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUpdated = useCallback(() => {
    setUpdated(true);
    if (updatedTimerRef.current) {
      clearTimeout(updatedTimerRef.current);
    }
    updatedTimerRef.current = setTimeout(() => setUpdated(false), UPDATED_VISIBLE_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finish = useCallback(
    async (started: readonly string[], latest: SyncConnectionState[]) => {
      try {
        const fresh = await fetchConnections();
        if (mountedRef.current) {
          setConnections(fresh);
        }
      } catch {
        // ponytail: the next navigation refetches connections
      }
      const succeeded = started.some((id) => {
        const state = latest.find((s) => s.connectionId === id);
        return state !== undefined && state.failure === null;
      });
      if (!succeeded || !mountedRef.current) {
        return;
      }
      if (fieldHasFocus()) {
        setReloadPending(true);
        showUpdated();
        return;
      }
      writeFlag(UPDATED_KEY, true);
      window.location.reload();
    },
    [showUpdated],
  );

  const startPolling = useCallback(
    (started: readonly string[]) => {
      if (pollRef.current) {
        return;
      }
      const deadline = Date.now() + MAX_POLL_MS;
      pollRef.current = setInterval(() => {
        void (async () => {
          try {
            const { connections: latest } = await fetchAutoSyncState();
            if (!mountedRef.current) {
              return;
            }
            setStates(latest);
            if (!latest.some((s) => s.live)) {
              stopPolling();
              await finish(started, latest);
              return;
            }
          } catch {
            // transient network error: keep polling until the deadline
          }
          if (Date.now() > deadline) {
            stopPolling();
          }
        })();
      }, POLL_MS);
    },
    [finish, stopPolling],
  );

  const refreshState = useCallback(
    async (started: readonly string[]) => {
      try {
        const { connections: latest } = await fetchAutoSyncState();
        if (!mountedRef.current) {
          return;
        }
        setStates(latest);
        if (latest.some((s) => s.live)) {
          startPolling(started);
        }
      } catch {
        // ponytail: cosmetic; the next navigation retries
      }
    },
    [startPolling],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (readFlag(UPDATED_KEY)) {
      writeFlag(UPDATED_KEY, false);
      showUpdated();
    }
    return () => {
      mountedRef.current = false;
      stopPolling();
      if (updatedTimerRef.current) {
        clearTimeout(updatedTimerRef.current);
      }
    };
  }, [showUpdated, stopPolling]);

  // Refetch on navigation so the banner clears after a sync started on /accounts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: Connection[];
      try {
        list = await fetchConnections();
      } catch {
        return; // ponytail: cosmetic notice; the next navigation retries
      }
      if (cancelled) {
        return;
      }
      setConnections(list);
      const now = new Date();
      if (needsAutoSync(list, now) && !readFlag(STARTED_KEY)) {
        writeFlag(STARTED_KEY, true);
        try {
          const result = await startAutoSync();
          if (mountedRef.current && result.started.length > 0) {
            startPolling(result.started);
          }
        } catch {
          // ponytail: a failed call is not retried this session; the stale banner still shows
        }
      }
      await refreshState([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, refreshState, startPolling]);

  const running = states
    .filter((s) => s.live && !s.otpRequired)
    .map((s) => providerLabel(s.providerCode));
  const problems = connections ? buildProblems(connections, states, new Date()) : [];

  const reload = useCallback(() => {
    writeFlag(UPDATED_KEY, true);
    window.location.reload();
  }, []);

  return { connections, running, problems, updated, reloadPending, reload };
}

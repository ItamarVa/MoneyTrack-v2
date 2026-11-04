/**
 * Wire types and browser fetchers for the on-open auto sync (routes under /api/sync/auto).
 * Why a separate state endpoint: a failed job row only says SYNC_FAILED; the real reason
 * (wrong password, blocked account...) lives on the scrape run, so GET /api/sync/auto resolves it.
 * The server imports the types only. Raw error classes cross the wire but are never shown to users
 * (see sync-error-messages.ts).
 */
import type { SyncSkipReason } from "@moneytrack/ingest";
import { apiUrl } from "@/lib/base-path";

export type AutoSyncSkipReason = SyncSkipReason;

export type AutoSyncStartResponse = {
  started: string[];
  skipped: { connectionId: string; reason: AutoSyncSkipReason }[];
};

export type SyncConnectionState = {
  connectionId: string;
  providerCode: string;
  /** A scrape job for this connection is queued, running or waiting for a code. */
  live: boolean;
  otpRequired: boolean;
  /** Set when the newest scrape job failed; errorClass is the scrape run's class when known. */
  failure: { errorClass: string; at: string } | null;
};

export type AutoSyncStateResponse = { connections: SyncConnectionState[] };

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export async function startAutoSync(): Promise<AutoSyncStartResponse> {
  return readJson<AutoSyncStartResponse>(
    await fetch(apiUrl("/api/sync/auto"), {
      method: "POST",
      headers: { "content-type": "application/json" },
    }),
  );
}

export async function fetchAutoSyncState(): Promise<AutoSyncStateResponse> {
  return readJson<AutoSyncStateResponse>(
    await fetch(apiUrl("/api/sync/auto"), { cache: "no-store" }),
  );
}

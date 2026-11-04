/**
 * Pure rules for the accounts page: which connections need the user ("needs action" block),
 * the one-word status per connection, and which connections have a live sync job.
 * Why: on a phone the user never scrolled to the connections; the page now surfaces only what
 * needs a decision. Order is fixed: missing credentials, then failed, then never synced.
 * Gotcha: a connection with a live job is never "needs action" (it is already being handled).
 * Used by accounts-page-client.tsx, needs-action-block.tsx and connections-section.tsx.
 */
import { MANUAL_PROVIDER_CODE, type Connection, type Job } from "@moneytrack/contracts";
import type { SyncConnectionState } from "@/components/sync/auto-sync-api";
import { describeSyncError } from "@/components/sync/sync-error-messages";
import { providerLabel } from "@/lib/provider-labels";
import he from "@/locales/he.json";

export type ConnectionLike = Pick<
  Connection,
  "id" | "providerCode" | "enabled" | "lastSuccessAt" | "credentialsSet"
>;

export type NeedsActionReason = "credentials_missing" | "failed" | "never_synced";

export type NeedsActionItem = {
  connectionId: string;
  reason: NeedsActionReason;
  message: string;
  /** "credentials" opens the credentials modal, "sync" starts a sync. */
  action: "credentials" | "sync";
};

export type ConnectionStatus =
  | "syncing"
  | "disabled"
  | "credentials_missing"
  | "failed"
  | "never"
  | "ok";

const CREDENTIAL_ERROR_CLASSES = new Set(["CREDENTIALS_MISSING", "INVALID_PASSWORD", "CHANGE_PASSWORD"]);

const REASON_ORDER: Record<NeedsActionReason, number> = {
  credentials_missing: 0,
  failed: 1,
  never_synced: 2,
};

function jobConnectionId(job: Job): string | null {
  const id = job.payloadJson.connectionId;
  return typeof id === "string" ? id : null;
}

/** Ids with a queued/running job, a live state, or a sync this page just started. */
export function liveConnectionIds(
  states: readonly SyncConnectionState[],
  jobs: readonly Job[],
  syncingId: string | null = null,
): Set<string> {
  const ids = new Set<string>();
  for (const state of states) {
    if (state.live) {
      ids.add(state.connectionId);
    }
  }
  for (const job of jobs) {
    const id = jobConnectionId(job);
    if (job.kind === "scrape" && id && (job.status === "queued" || job.status === "running")) {
      ids.add(id);
    }
  }
  if (syncingId) {
    ids.add(syncingId);
  }
  return ids;
}

export function selectNeedsAction(
  connections: readonly ConnectionLike[],
  states: readonly SyncConnectionState[],
  liveIds: ReadonlySet<string>,
): NeedsActionItem[] {
  const items: NeedsActionItem[] = [];
  for (const connection of connections) {
    if (!connection.enabled || connection.providerCode === MANUAL_PROVIDER_CODE) {
      continue;
    }
    if (liveIds.has(connection.id)) {
      continue;
    }
    const provider = providerLabel(connection.providerCode);
    const failure = states.find((s) => s.connectionId === connection.id)?.failure ?? null;

    if (!connection.credentialsSet) {
      items.push({
        connectionId: connection.id,
        reason: "credentials_missing",
        message: he.accountsUx.needsAction.credentialsMissing.replace("{provider}", provider),
        action: "credentials",
      });
    } else if (failure) {
      items.push({
        connectionId: connection.id,
        reason: "failed",
        // Only "what happened": the "what to do" text points at this very screen.
        message: describeSyncError(failure.errorClass, connection.providerCode).what,
        action: CREDENTIAL_ERROR_CLASSES.has(failure.errorClass) ? "credentials" : "sync",
      });
    } else if (!connection.lastSuccessAt) {
      items.push({
        connectionId: connection.id,
        reason: "never_synced",
        message: he.accountsUx.needsAction.neverSynced.replace("{provider}", provider),
        action: "sync",
      });
    }
  }
  // Array.prototype.sort is stable: connections keep their given order within a reason.
  return items.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]);
}

export function connectionStatus(
  connection: ConnectionLike,
  state: SyncConnectionState | undefined,
  live: boolean,
): ConnectionStatus {
  if (live) {
    return "syncing";
  }
  if (!connection.enabled) {
    return "disabled";
  }
  if (!connection.credentialsSet) {
    return "credentials_missing";
  }
  if (state?.failure) {
    return "failed";
  }
  return connection.lastSuccessAt ? "ok" : "never";
}

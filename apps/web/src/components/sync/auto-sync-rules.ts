/**
 * Pure client-side rules for the on-open auto sync.
 * needsAutoSync: is any enabled bank connection's last success older than 24h (or never)?
 * Only a cheap pre-check, the server re-decides under the lockout guards (ingest sync-due).
 * buildProblems: the messages to show, from connections that are still stale plus failed jobs.
 * Used by use-auto-sync.ts and the Accounts card.
 */
import { MANUAL_PROVIDER_CODE, type Connection } from "@moneytrack/contracts";
import type { SyncConnectionState } from "@/components/sync/auto-sync-api";
import { describeSyncError } from "@/components/sync/sync-error-messages";
import { providerLabel } from "@/lib/provider-labels";
import he from "@/locales/he.json";

// Mirrors ON_OPEN_STALE_MS in @moneytrack/ingest; a runtime import would drag node-only code into the client bundle.
const ON_OPEN_STALE_MS = 24 * 60 * 60 * 1000;

type ConnectionLike = Pick<
  Connection,
  "id" | "providerCode" | "enabled" | "lastSuccessAt" | "credentialsSet"
>;

export type AutoSyncProblem = { connectionId: string; text: string };

function isStale(connection: ConnectionLike, now: Date): boolean {
  if (!connection.lastSuccessAt) {
    return true;
  }
  const last = Date.parse(connection.lastSuccessAt);
  return !Number.isFinite(last) || now.getTime() - last > ON_OPEN_STALE_MS;
}

function activeBankConnections<T extends ConnectionLike>(connections: readonly T[]): T[] {
  return connections.filter((c) => c.enabled && c.providerCode !== MANUAL_PROVIDER_CODE);
}

export function needsAutoSync(connections: readonly ConnectionLike[], now: Date): boolean {
  return activeBankConnections(connections).some(
    (c) => c.credentialsSet && isStale(c, now),
  );
}

export function buildProblems(
  connections: readonly ConnectionLike[],
  states: readonly SyncConnectionState[],
  now: Date,
): AutoSyncProblem[] {
  const problems: AutoSyncProblem[] = [];
  for (const connection of activeBankConnections(connections)) {
    if (!isStale(connection, now)) {
      continue;
    }
    const provider = providerLabel(connection.providerCode);
    if (!connection.credentialsSet) {
      problems.push({
        connectionId: connection.id,
        text: he.autoSync.credentialsMissing.replace("{provider}", provider),
      });
      continue;
    }
    const state = states.find((s) => s.connectionId === connection.id);
    if (state?.otpRequired) {
      problems.push({ connectionId: connection.id, text: he.autoSync.otp.replace("{provider}", provider) });
    } else if (state?.failure && !state.live) {
      problems.push({
        connectionId: connection.id,
        text: describeSyncError(state.failure.errorClass, connection.providerCode).text,
      });
    }
  }
  return problems;
}

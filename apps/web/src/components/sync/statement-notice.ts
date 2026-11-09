/**
 * Isracard/Amex have no working automatic sync, so the UI shows a neutral "upload a file" line
 * for them instead of a sync-failure warning. Pure decisions only; no browser storage.
 * Why: the owner uploads statement files; the server reports the newest import as
 * `lastStatementImportAt` (connection-status.ts), so every device agrees.
 * Used by stale-data-banner.tsx, accounts-needs-action.ts, attention-page-client.tsx.
 */
import { MANUAL_PROVIDER_CODE, type Connection } from "@moneytrack/contracts";
import { supportsStatementUpload } from "@/components/accounts/statement-upload";
import type { SyncConnectionState } from "@/components/sync/auto-sync-api";

export const STATEMENT_NOTICE_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_SYNC_DAYS = 3;

type Like = Pick<Connection, "id" | "providerCode" | "enabled" | "lastSuccessAt"> &
  Partial<Pick<Connection, "lastStatementImportAt">>;

export const isStatementConnection = (c: Pick<Connection, "providerCode">): boolean =>
  supportsStatementUpload(c.providerCode);

function within(iso: string | null | undefined, days: number, now: Date): boolean {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) && now.getTime() - ms <= days * DAY_MS;
}

/** True for an enabled Isracard/Amex connection with neither a recent sync nor a recent uploaded file. */
export function statementNoticeDue(c: Like, now: Date): boolean {
  return (
    c.enabled &&
    c.providerCode !== MANUAL_PROVIDER_CODE &&
    isStatementConnection(c) &&
    !within(c.lastSuccessAt, FRESH_SYNC_DAYS, now) &&
    !within(c.lastStatementImportAt, STATEMENT_NOTICE_DAYS, now)
  );
}

export function needsStatementNotice(connections: readonly Like[], now: Date): boolean {
  return connections.some((c) => statementNoticeDue(c, now));
}

/** Ids of statement connections whose latest sync failed and that are not being synced now: shown calmly, not as a failure. */
export function selectStatementInfo(
  connections: readonly Like[],
  states: readonly SyncConnectionState[],
  liveIds: ReadonlySet<string>,
  now: Date,
): string[] {
  return connections
    .filter(
      (c) =>
        !liveIds.has(c.id) &&
        states.some((s) => s.connectionId === c.id && s.failure) &&
        statementNoticeDue(c, now),
    )
    .map((c) => c.id);
}

/**
 * Pure decision for the stale-data banner: is the household data out of date?
 * Why: the add-on once went 7 weeks without a sync and nothing on screen said so.
 * Rule: only enabled, non-manual connections count. Stale means none of them has a
 * successful sync in the last STALE_AFTER_DAYS; "partial" means some do but at least
 * one never synced or has no login secret. Used by StaleDataBanner.
 */
import { MANUAL_PROVIDER_CODE, type Connection } from "@moneytrack/contracts";

export const STALE_AFTER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

type ConnectionSyncState = Pick<
  Connection,
  "providerCode" | "enabled" | "lastSuccessAt" | "credentialsSet"
>;

export type StaleDataStatus =
  | { show: false }
  | { show: true; kind: "stale" | "never" | "partial"; since: string | null };

export function evaluateStaleData(
  connections: readonly ConnectionSyncState[],
  now: Date,
): StaleDataStatus {
  const active = connections.filter((c) => c.enabled && c.providerCode !== MANUAL_PROVIDER_CODE);
  if (active.length === 0) {
    return { show: false };
  }

  let since: string | null = null;
  for (const c of active) {
    if (c.lastSuccessAt && (since === null || Date.parse(c.lastSuccessAt) > Date.parse(since))) {
      since = c.lastSuccessAt;
    }
  }

  const cutoff = now.getTime() - STALE_AFTER_DAYS * DAY_MS;
  const anyFresh = active.some((c) => c.lastSuccessAt !== null && Date.parse(c.lastSuccessAt) >= cutoff);
  if (!anyFresh) {
    return { show: true, kind: since ? "stale" : "never", since };
  }
  if (active.some((c) => c.lastSuccessAt === null || !c.credentialsSet)) {
    return { show: true, kind: "partial", since };
  }
  return { show: false };
}

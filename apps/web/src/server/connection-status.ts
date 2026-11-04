/**
 * Derived per-connection status for the connections API: when the last successful
 * scrape finished and whether a login secret exists in the vault.
 * Why: `connections.last_run_id` is invisible to the UI and a missing secret only
 * surfaces as a failed job. Invariant: the secret is probed, never returned or logged.
 * Used by GET/POST /api/connections.
 */
import { connections, eq, scrapeRuns, type MoneyTrackDb } from "@moneytrack/db";
import { loadSecret } from "@moneytrack/vault";
import type { ConnectionStatus } from "@/server/mappers";

type ConnectionRow = typeof connections.$inferSelect;

/** The vault has no existence check; any failed load means the connection cannot sync. */
async function vaultHasSecret(credentialRef: string): Promise<boolean> {
  try {
    await loadSecret(credentialRef);
    return true;
  } catch {
    return false;
  }
}

export async function loadConnectionStatuses(
  db: MoneyTrackDb,
  rows: readonly ConnectionRow[],
  hasSecret: (credentialRef: string) => Promise<boolean> = vaultHasSecret,
): Promise<Map<string, ConnectionStatus>> {
  const lastSuccess = new Map<string, string>();
  const runs = db
    .select({ connectionId: scrapeRuns.connectionId, finishedAt: scrapeRuns.finishedAt })
    .from(scrapeRuns)
    .where(eq(scrapeRuns.status, "success"))
    .all();
  for (const run of runs) {
    if (run.finishedAt && run.finishedAt > (lastSuccess.get(run.connectionId) ?? "")) {
      lastSuccess.set(run.connectionId, run.finishedAt);
    }
  }

  const statuses = new Map<string, ConnectionStatus>();
  for (const row of rows) {
    statuses.set(row.id, {
      lastSuccessAt: lastSuccess.get(row.id) ?? null,
      credentialsSet: await hasSecret(row.credentialRef),
    });
  }
  return statuses;
}

/**
 * Concurrency guard for POST /api/sync: at most one live scrape job per connection.
 * Without it an authenticated session can enqueue unlimited jobs, and each one is a real
 * browser login at the bank — repeated logins trigger account lockouts and fraud flags.
 * The staleness window is load-bearing: a crashed agent leaves a "running" row behind, and
 * without expiry that row would block the connection forever. See memory/security.md.
 */

const ACTIVE_SYNC_STATUSES = new Set(["queued", "running", "otp_required"]);

export const SYNC_JOB_STALE_MS = 30 * 60 * 1000;

type JobRowLike = {
  kind: string;
  status: string;
  payloadJson: string;
  updatedAt: string;
};

function readConnectionId(payloadJson: string): string | null {
  try {
    const parsed = JSON.parse(payloadJson) as { connectionId?: unknown };
    return typeof parsed.connectionId === "string" ? parsed.connectionId : null;
  } catch {
    return null;
  }
}

export function hasLiveScrapeJob(
  rows: readonly JobRowLike[],
  connectionId: string,
  nowMs: number,
): boolean {
  const cutoff = nowMs - SYNC_JOB_STALE_MS;

  return rows.some((row) => {
    if (row.kind !== "scrape" || !ACTIVE_SYNC_STATUSES.has(row.status)) {
      return false;
    }
    const updatedMs = Date.parse(row.updatedAt);
    if (Number.isFinite(updatedMs) && updatedMs < cutoff) {
      return false;
    }
    return readConnectionId(row.payloadJson) === connectionId;
  });
}

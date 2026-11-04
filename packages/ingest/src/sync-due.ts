/**
 * Pure "is this connection due for an automatic sync" rules, shared by the nightly agent
 * scheduler (mode "nightly") and POST /api/sync/auto (mode "on_open").
 * Bank-lockout guards, identical in both modes: never with a live scrape job, never within
 * ATTEMPT_GUARD_MS of any earlier scrape job (failed included), never without a stored login.
 * The nightly time window is the agent's concern, not decided here. Manual sync bypasses all of it.
 * Used by apps/agent sync-schedule and apps/web api/sync/auto.
 */

export type SyncDueMode = "nightly" | "on_open";

export type SyncSkipReason =
  | "disabled"
  | "fresh"
  | "credentials_missing"
  | "live_job"
  | "attempted_recently";

/** An automatic attempt per connection at most once per 20 hours, whatever its outcome. */
export const ATTEMPT_GUARD_MS = 20 * 60 * 60 * 1000;
/** On open, a last successful sync older than this makes the connection due. */
export const ON_OPEN_STALE_MS = 24 * 60 * 60 * 1000;
// A crashed agent leaves a "running" row behind; without expiry it would block the connection forever.
export const LIVE_JOB_STALE_MS = 30 * 60 * 1000;

const LIVE_STATUSES = new Set(["queued", "running", "otp_required"]);

export type SyncJobLike = {
  kind: string;
  status: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
};

export type SyncDueDecision = { due: true } | { due: false; reason: SyncSkipReason };

function jobConnectionId(payloadJson: string): string | null {
  try {
    const parsed = JSON.parse(payloadJson) as { connectionId?: unknown };
    return typeof parsed.connectionId === "string" ? parsed.connectionId : null;
  } catch {
    return null;
  }
}

export function scrapeJobsFor<T extends SyncJobLike>(jobs: readonly T[], connectionId: string): T[] {
  return jobs.filter((row) => row.kind === "scrape" && jobConnectionId(row.payloadJson) === connectionId);
}

export function hasLiveJob(scrapes: readonly SyncJobLike[], nowMs: number): boolean {
  const cutoff = nowMs - LIVE_JOB_STALE_MS;
  return scrapes.some((row) => {
    if (!LIVE_STATUSES.has(row.status)) {
      return false;
    }
    const updatedMs = Date.parse(row.updatedAt);
    return !(Number.isFinite(updatedMs) && updatedMs < cutoff);
  });
}

function hasRecentAttempt(scrapes: readonly SyncJobLike[], nowMs: number): boolean {
  return scrapes.some((row) => {
    const createdMs = Date.parse(row.createdAt);
    // Unparseable timestamp: assume recent, the safe side of the lockout guard.
    return !Number.isFinite(createdMs) || createdMs > nowMs - ATTEMPT_GUARD_MS;
  });
}

function isFresh(lastSuccessAt: string | null, nowMs: number): boolean {
  if (!lastSuccessAt) {
    return false;
  }
  const successMs = Date.parse(lastSuccessAt);
  return Number.isFinite(successMs) && nowMs - successMs <= ON_OPEN_STALE_MS;
}

export function evaluateSyncDue(input: {
  connection: { id: string; enabled: boolean };
  jobs: readonly SyncJobLike[];
  now: Date;
  mode: SyncDueMode;
  /** finishedAt of the newest successful scrape run; only read in "on_open" mode. */
  lastSuccessAt: string | null;
  credentialsSet: boolean;
}): SyncDueDecision {
  const nowMs = input.now.getTime();
  if (!input.connection.enabled) {
    return { due: false, reason: "disabled" };
  }
  if (input.mode === "on_open" && isFresh(input.lastSuccessAt, nowMs)) {
    return { due: false, reason: "fresh" };
  }
  if (!input.credentialsSet) {
    return { due: false, reason: "credentials_missing" };
  }
  const scrapes = scrapeJobsFor(input.jobs, input.connection.id);
  if (hasLiveJob(scrapes, nowMs)) {
    return { due: false, reason: "live_job" };
  }
  if (hasRecentAttempt(scrapes, nowMs)) {
    return { due: false, reason: "attempted_recently" };
  }
  return { due: true };
}

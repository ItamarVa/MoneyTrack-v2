/**
 * Nightly auto-sync: enqueues one scrape job per due connection, the same row POST /api/sync inserts.
 * Window: 02:00-05:00 Israel time (Intl, never the container TZ, so DST shifts cannot move it).
 * Due rules (live job, 20h attempt guard, credentials) live in @moneytrack/ingest sync-due, shared
 * with POST /api/sync/auto; this file adds only the window and the enqueue.
 * Called from processQueuedJobs each tick.
 */
import { randomUUID } from "node:crypto";
import { connections, jobs, type MoneyTrackDb } from "@moneytrack/db";
import { ATTEMPT_GUARD_MS, evaluateSyncDue, type SyncJobLike } from "@moneytrack/ingest";
import { loadSecret } from "@moneytrack/vault";

export const NIGHT_WINDOW_START_HOUR = 2;
export const NIGHT_WINDOW_END_HOUR = 5;
export const RECENT_ATTEMPT_MS = ATTEMPT_GUARD_MS;

type ConnectionLike = { id: string; enabled: boolean; credentialRef: string };

const israelHourFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  hour: "numeric",
  hourCycle: "h23",
});

export function israelHour(now: Date): number {
  const part = israelHourFormat.formatToParts(now).find((p) => p.type === "hour");
  return Number(part?.value ?? Number.NaN);
}

export function isInNightlyWindow(now: Date): boolean {
  const hour = israelHour(now);
  return hour >= NIGHT_WINDOW_START_HOUR && hour < NIGHT_WINDOW_END_HOUR;
}

/** The vault has no existence check: a failed load (not found or any vault error) means do not scrape. */
export async function vaultHasSecret(credentialRef: string): Promise<boolean> {
  try {
    await loadSecret(credentialRef);
    return true;
  } catch {
    return false;
  }
}

export async function selectDueConnectionIds(input: {
  connections: readonly ConnectionLike[];
  jobs: readonly SyncJobLike[];
  now: Date;
  hasSecret: (credentialRef: string) => Promise<boolean>;
}): Promise<string[]> {
  if (!isInNightlyWindow(input.now)) {
    return [];
  }
  const due: string[] = [];
  for (const connection of input.connections) {
    const decision = evaluateSyncDue({
      connection,
      jobs: input.jobs,
      now: input.now,
      mode: "nightly",
      lastSuccessAt: null,
      credentialsSet: true,
    });
    // Probe the vault only for connections that pass every cheap guard: this runs every tick.
    if (decision.due && (await input.hasSecret(connection.credentialRef))) {
      due.push(connection.id);
    }
  }
  return due;
}

export async function enqueueDueSyncJobs(
  db: MoneyTrackDb,
  now: Date = new Date(),
  hasSecret: (credentialRef: string) => Promise<boolean> = vaultHasSecret,
): Promise<string[]> {
  if (!isInNightlyWindow(now)) {
    return [];
  }
  const dueIds = await selectDueConnectionIds({
    connections: db.select().from(connections).all(),
    jobs: db.select().from(jobs).all(),
    now,
    hasSecret,
  });
  const timestamp = now.toISOString();
  for (const connectionId of dueIds) {
    db.insert(jobs)
      .values({
        id: randomUUID(),
        kind: "scrape",
        payloadJson: JSON.stringify({ connectionId }),
        status: "queued",
        otpPrompt: null,
        otpResponse: null,
        attempts: 0,
        errorClass: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }
  return dueIds;
}

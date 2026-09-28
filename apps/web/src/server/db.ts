import { installEgressGuard } from "@moneytrack/egress";
import { closeDb, initDb, runMigrations } from "@moneytrack/db";
import type { MoneyTrackDb } from "@moneytrack/db";

// On globalThis for the same reason as the handle in @moneytrack/db connection.ts:
// Next bundles this module once per route group, and a per-copy cache would keep
// serving a handle another copy closed or replaced.
type ServerDbState = { promise: Promise<MoneyTrackDb> | null };
const state: ServerDbState = ((globalThis as { [key: symbol]: ServerDbState })[
  Symbol.for("moneytrack.web.serverDb")
] ??= { promise: null });

/** Close the singleton handle so a database file can be replaced (HA import). */
export function resetServerDb(): void {
  closeDb();
  state.promise = null;
}

function resolveBindHost(): string {
  return (
    process.env.MONEYTRACK_BIND_HOST ??
    process.env.HOSTNAME ??
    "127.0.0.1"
  );
}

/** Re-open the DB after import using the key already in /dev/shm (HA add-on). */
export async function reopenServerDbWithKey(key: Buffer): Promise<MoneyTrackDb> {
  resetServerDb();
  installEgressGuard();
  const skipGuards = process.env.MONEYTRACK_MODE === "ha-addon";
  state.promise = initDb({ key, bindHost: resolveBindHost(), skipGuards }).then((database) => {
    runMigrations();
    return database;
  });
  return state.promise;
}

export async function getServerDb(): Promise<MoneyTrackDb> {
  if (!state.promise) {
    installEgressGuard();
    const opening = initDb({ bindHost: resolveBindHost() }).then((db) => {
      runMigrations();
      return db;
    });
    // HA add-on: the first call can fail because the vault is still locked;
    // caching that rejection would keep the DB closed after unlock.
    opening.catch(() => {
      if (state.promise === opening) {
        state.promise = null;
      }
    });
    state.promise = opening;
  }
  return state.promise;
}

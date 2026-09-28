import fs from "node:fs";
import { installEgressGuard } from "@moneytrack/egress";
import { closeDb, getDb, initDb, resolveDbPath, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { waitForDbKeyInShm } from "@moneytrack/vault";
import { getPollIntervalMs, processQueuedJobs, runAgentReferenceSchedule } from "./job-processor.js";

function log(message: string): void {
  process.stdout.write(`[agent] ${new Date().toISOString()} ${message}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dbFileId(): number | null {
  try {
    return fs.statSync(resolveDbPath()).ino;
  } catch {
    return null;
  }
}

/** One poll cycle: jobs first so reference refresh failures never block bank syncs. */
export async function runAgentTick(db: MoneyTrackDb): Promise<void> {
  try {
    const count = await processQueuedJobs(db);
    if (count > 0) {
      log(`processed ${count} job(s)`);
    }
  } catch (error) {
    log(`job error: ${errorMessage(error)}`);
  }

  try {
    const refreshed = await runAgentReferenceSchedule(db);
    if (refreshed.length > 0) {
      log(`reference refresh: ${refreshed.join(", ")}`);
    }
  } catch (error) {
    log(`reference refresh unavailable: ${errorMessage(error)}`);
  }
}

async function main(): Promise<void> {
  installEgressGuard();
  if (process.env.MONEYTRACK_MODE === "ha-addon") {
    log("waiting for database unlock key in shared memory");
    await waitForDbKeyInShm({ pollMs: 1000 });
  }
  await initDb();
  runMigrations();
  let openedFileId = dbFileId();
  log("agent ready");

  const intervalMs = getPollIntervalMs();
  log(`polling jobs every ${intervalMs}ms`);

  const tick = async (): Promise<void> => {
    // The HA import renames a new file over the DB; this connection would keep
    // reading and writing the replaced one.
    const currentFileId = dbFileId();
    if (currentFileId !== null && currentFileId !== openedFileId) {
      log("database file replaced; reopening");
      closeDb();
      await initDb();
      runMigrations();
      openedFileId = currentFileId;
    }
    const db = await getDb();
    await runAgentTick(db);
  };

  await tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}

function shutdown(): void {
  closeDb();
  log("stopped");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!process.env.VITEST) {
  main().catch((error: unknown) => {
    process.stderr.write(`[agent] fatal: ${errorMessage(error)}\n`);
    process.exit(1);
  });
}

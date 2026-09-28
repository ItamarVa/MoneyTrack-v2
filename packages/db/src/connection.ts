import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getOrCreateMasterKey } from "@moneytrack/vault";
import * as schema from "./schema.js";
import { runStartupGuards } from "./guards.js";
import { resolveDataDir, resolveDbPath } from "./paths.js";

export type MoneyTrackDb = BetterSQLite3Database<typeof schema>;
type SqliteDatabase = InstanceType<typeof Database>;

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

// Next's production build inlines this module into several independent copies
// (each route-handler chunk group, and pages in a separate runtime), so a plain
// module variable gives one connection per copy, and closeDb() before an HA
// import would leave the other copies reading the replaced file (MEM-LESSONS).
type ConnectionState = { sqlite: SqliteDatabase | null; db: MoneyTrackDb | null };
const state: ConnectionState = ((globalThis as { [key: symbol]: ConnectionState })[
  Symbol.for("moneytrack.db.connection")
] ??= { sqlite: null, db: null });

function configureEncryptedConnection(
  connection: SqliteDatabase,
  key: Buffer,
): void {
  connection.pragma("cipher='sqlcipher'");
  connection.key(key);
  connection.prepare("SELECT 1").get();
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.pragma("temp_store = MEMORY");
  connection.pragma("foreign_keys = ON");
}

export function openEncryptedDatabase(
  dbPath: string,
  key: Buffer,
  options?: { fileMustExist?: boolean },
): SqliteDatabase {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const connection = new Database(dbPath, {
    fileMustExist: options?.fileMustExist ?? false,
  });
  try {
    configureEncryptedConnection(connection, key);
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export async function initDb(options?: {
  dataDir?: string;
  key?: Buffer;
  bindHost?: string;
  skipGuards?: boolean;
}): Promise<MoneyTrackDb> {
  if (state.db) {
    return state.db;
  }

  const dataDir = resolveDataDir(options?.dataDir);
  if (!options?.skipGuards) {
    runStartupGuards({ dataDir, bindHost: options?.bindHost });
  }

  const dbPath = resolveDbPath(dataDir);
  const key = options?.key ?? (await getOrCreateMasterKey());
  if (key.length !== 32) {
    throw new Error("Database encryption key must be 32 bytes");
  }

  const exists = fs.existsSync(dbPath);
  const sqlite = openEncryptedDatabase(dbPath, key, { fileMustExist: exists });
  state.sqlite = sqlite;
  state.db = drizzle(sqlite, { schema });
  return state.db;
}

export async function getDb(): Promise<MoneyTrackDb> {
  if (!state.db) {
    return initDb();
  }
  return state.db;
}

export function getSqlite(): SqliteDatabase {
  if (!state.sqlite) {
    throw new Error("Database not initialized — call initDb() first");
  }
  return state.sqlite;
}

export function runMigrations(connection?: SqliteDatabase): void {
  const client = connection ?? getSqlite();
  const drizzleDb = drizzle(client, { schema });
  migrate(drizzleDb, { migrationsFolder });
}

export function closeDb(): void {
  if (state.sqlite) {
    state.sqlite.close();
    state.sqlite = null;
    state.db = null;
  }
}

export { resolveDataDir, resolveDbPath, runStartupGuards };

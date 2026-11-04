/**
 * One-time Windows → Home Assistant database transfer.
 * Export: VACUUM INTO a copy, re-key with a disposable text passphrase.
 * Import: copy the bundle, re-key it to the live raw 32-byte DB key, then carry
 * the HA-enrolled users over from the live DB (keyslots.json points at them).
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openEncryptedDatabase, runMigrations } from "./connection.js";
import { defaultDataDir, resolveDbPath } from "./paths.js";
import { connections, people, sessions, users } from "./schema.js";

export const HA_IMPORT_FILENAME = "moneytrack-import.db";

const DEFAULT_HA_IMPORT_DIR = "/share/moneytrack-import";

type SqliteDatabase = InstanceType<typeof Database>;

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function configureRawKey(connection: SqliteDatabase, key: Buffer): void {
  connection.pragma("cipher='sqlcipher'");
  connection.key(key);
  connection.prepare("SELECT 1").get();
}

function openWithExportPassphrase(dbPath: string, passphrase: string): SqliteDatabase {
  const connection = new Database(dbPath, { fileMustExist: true });
  connection.pragma("cipher='sqlcipher'");
  connection.pragma(`key = '${escapeSqlString(passphrase)}'`);
  connection.prepare("SELECT 1").get();
  return connection;
}

function removeSqliteSidecars(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

/** Directory scanned for `moneytrack-import.db` (HA Samba share by default). */
export function resolveImportDir(): string {
  if (process.env.MONEYTRACK_IMPORT_DIR) {
    return path.resolve(process.env.MONEYTRACK_IMPORT_DIR);
  }
  if (process.env.MONEYTRACK_MODE === "ha-addon") {
    return DEFAULT_HA_IMPORT_DIR;
  }
  return path.join(path.dirname(defaultDataDir()), "moneytrack-import");
}

export function resolveImportFilePath(importDir?: string): string {
  return path.join(importDir ?? resolveImportDir(), HA_IMPORT_FILENAME);
}

export function isHaImportFileAvailable(importDir?: string): boolean {
  try {
    return fs.existsSync(resolveImportFilePath(importDir));
  } catch {
    return false;
  }
}

/**
 * Copy an encrypted DB and re-key the copy for one-time transfer.
 * Returns the path of the passphrase-protected bundle.
 */
export function exportDatabaseForHaTransfer(options: {
  sourceDbPath: string;
  sourceKey: Buffer;
  outputPath: string;
  exportPassphrase: string;
}): string {
  const { sourceDbPath, sourceKey, outputPath, exportPassphrase } = options;
  if (sourceKey.length !== 32) {
    throw new Error("Source encryption key must be 32 bytes");
  }

  const stagingPath = `${outputPath}.staging`;
  removeSqliteSidecars(stagingPath);
  removeSqliteSidecars(outputPath);

  const source = new Database(sourceDbPath, { fileMustExist: true });
  try {
    configureRawKey(source, sourceKey);
    source.prepare("VACUUM INTO ?").run(stagingPath);
  } finally {
    source.close();
  }

  const staging = new Database(stagingPath, { fileMustExist: true });
  try {
    configureRawKey(staging, sourceKey);
    staging.pragma(`rekey = '${escapeSqlString(exportPassphrase)}'`);
  } finally {
    staging.close();
  }

  fs.renameSync(stagingPath, outputPath);
  removeSqliteSidecars(stagingPath);
  return outputPath;
}

/**
 * Decrypt a transfer bundle and write a new database file encrypted with `targetKey`.
 */
export function importDatabaseFromHaTransfer(options: {
  importPath: string;
  exportPassphrase: string;
  outputDbPath: string;
  targetKey: Buffer;
}): void {
  const { importPath, exportPassphrase, outputDbPath, targetKey } = options;
  if (targetKey.length !== 32) {
    throw new Error("Target encryption key must be 32 bytes");
  }

  const stagingPath = `${outputDbPath}.rekey`;
  removeSqliteSidecars(outputDbPath);
  removeSqliteSidecars(stagingPath);
  fs.copyFileSync(importPath, stagingPath);

  const connection = openWithExportPassphrase(stagingPath, exportPassphrase);
  try {
    connection.rekey(targetKey);
  } finally {
    connection.close();
  }

  fs.renameSync(stagingPath, outputDbPath);
  removeSqliteSidecars(stagingPath);
}

/**
 * Copies every HA-enrolled user (with their people row and sessions) from the
 * live DB into an imported one, so each keyslot still matches a user id, PINs
 * keep working and the importing user stays signed in. Both files use `key`.
 * The import is migrated first: a Windows export may predate the HA columns.
 */
export function carryOverHaUsers(options: { fromDbPath: string; toDbPath: string; key: Buffer }): void {
  const live = openEncryptedDatabase(options.fromDbPath, options.key, { fileMustExist: true });
  let haUsers: (typeof users.$inferSelect)[];
  let haPeople: (typeof people.$inferSelect)[] = [];
  let haSessions: (typeof sessions.$inferSelect)[] = [];
  try {
    const from = drizzle(live);
    haUsers = from.select().from(users).where(isNotNull(users.haUserId)).all();
    if (haUsers.length > 0) {
      haPeople = from.select().from(people).where(inArray(people.id, haUsers.map((row) => row.personId))).all();
      haSessions = from.select().from(sessions).where(inArray(sessions.userId, haUsers.map((row) => row.id))).all();
    }
  } finally {
    live.close();
  }

  const target = openEncryptedDatabase(options.toDbPath, options.key, { fileMustExist: true });
  try {
    runMigrations(target);
    const to = drizzle(target);
    to.transaction((tx) => {
      // Windows profile paths do not exist in the container; the next sync recreates one under /data.
      tx.update(connections).set({ puppeteerProfileDir: null }).run();
      for (const person of haPeople) {
        tx.insert(people).values(person).run();
      }
      for (const user of haUsers) {
        tx.update(users)
          .set({ username: `${user.username}-windows` })
          .where(and(eq(users.username, user.username), ne(users.id, user.id)))
          .run();
        tx.insert(users).values(user).run();
      }
      for (const session of haSessions) {
        tx.insert(sessions).values(session).run();
      }
    });
    // replaceLiveDatabaseFile moves only the main file, so nothing may stay in the WAL.
    target.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    target.close();
  }
}

/** Swap the live data-dir database for a completed import file. */
export function replaceLiveDatabaseFile(dataDir: string, importedDbPath: string): void {
  const livePath = resolveDbPath(dataDir);
  removeSqliteSidecars(livePath);
  fs.renameSync(importedDbPath, livePath);
  removeSqliteSidecars(importedDbPath);
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDb,
  openEncryptedDatabase,
  runMigrations,
} from "./connection.js";
import {
  carryOverHaUsers,
  exportDatabaseForHaTransfer,
  importDatabaseFromHaTransfer,
  isHaImportFileAvailable,
  replaceLiveDatabaseFile,
  resolveImportFilePath,
} from "./data-import.js";
import { resolveDbPath } from "./paths.js";
import { isEncryptedSqliteAvailable } from "./native-support.js";

describe.skipIf(!isEncryptedSqliteAvailable())("HA data import export round-trip", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("exports with a passphrase and imports under a new raw key", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ha-import-"));
    const sourceKey = randomBytes(32);
    const targetKey = randomBytes(32);
    const exportPassphrase = `export-${randomUUID()}`;
    const sourcePath = path.join(tmpDir, "source.db");
    const bundlePath = path.join(tmpDir, "bundle.db");
    const importedPath = path.join(tmpDir, "imported.db");

    const source = openEncryptedDatabase(sourcePath, sourceKey);
    runMigrations(source);
    source
      .prepare(
        "INSERT INTO audit_log (id, user_id, action, metadata, created_at) VALUES (?, NULL, ?, ?, ?)",
      )
      .run(randomUUID(), "ha-import-marker", JSON.stringify({ ok: true }), new Date().toISOString());
    source.close();

    exportDatabaseForHaTransfer({
      sourceDbPath: sourcePath,
      sourceKey,
      outputPath: bundlePath,
      exportPassphrase,
    });

    importDatabaseFromHaTransfer({
      importPath: bundlePath,
      exportPassphrase,
      outputDbPath: importedPath,
      targetKey,
    });

    const imported = openEncryptedDatabase(importedPath, targetKey, { fileMustExist: true });
    const row = imported
      .prepare("SELECT action FROM audit_log WHERE action = ?")
      .get("ha-import-marker") as { action: string } | undefined;
    imported.close();

    expect(row?.action).toBe("ha-import-marker");
  });

  it("keeps HA users, their sessions and people across the DB swap", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ha-import-"));
    const key = randomBytes(32);
    const livePath = resolveDbPath(tmpDir);
    const stagingPath = path.join(tmpDir, "staging.db");
    const now = new Date().toISOString();
    const addUser = (
      connection: ReturnType<typeof openEncryptedDatabase>,
      ids: { person: string; user: string },
      haUserId: string | null,
    ) => {
      connection
        .prepare("INSERT INTO people (id, display_name, is_child, created_at, updated_at) VALUES (?, ?, 0, ?, ?)")
        .run(ids.person, "owner", now, now);
      connection
        .prepare(
          "INSERT INTO users (id, person_id, username, password_hash, must_change_password, ha_user_id, pin_hash, pin_failed_count, created_at, updated_at) VALUES (?, ?, 'owner', 'hash', 0, ?, ?, 0, ?, ?)",
        )
        .run(ids.user, ids.person, haUserId, haUserId ? "pin-hash" : null, now, now);
    };

    const haIds = { person: randomUUID(), user: randomUUID() };
    const sessionId = randomUUID();
    const live = openEncryptedDatabase(livePath, key);
    runMigrations(live);
    addUser(live, haIds, "ha-owner");
    live
      .prepare(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, 'token', ?, ?, ?)",
      )
      .run(sessionId, haIds.user, now, now, now);
    live.close();

    const windowsIds = { person: randomUUID(), user: randomUUID() };
    const connectionId = randomUUID();
    const staging = openEncryptedDatabase(stagingPath, key);
    runMigrations(staging);
    addUser(staging, windowsIds, null);
    staging
      .prepare(
        "INSERT INTO connections (id, provider_code, credential_ref, enabled, puppeteer_profile_dir, created_at, updated_at) VALUES (?, 'hapoalim', 'ref', 1, 'C:\\MoneyTrack\\data\\puppeteer\\x', ?, ?)",
      )
      .run(connectionId, now, now);
    staging.close();

    carryOverHaUsers({ fromDbPath: livePath, toDbPath: stagingPath, key });
    replaceLiveDatabaseFile(tmpDir, stagingPath);

    const result = openEncryptedDatabase(livePath, key, { fileMustExist: true });
    const usernames = result
      .prepare("SELECT id, username, ha_user_id AS haUserId FROM users WHERE id IN (?, ?) ORDER BY username")
      .all(haIds.user, windowsIds.user);
    const session = result.prepare("SELECT user_id AS userId FROM sessions WHERE id = ?").get(sessionId);
    const profileDir = result
      .prepare("SELECT puppeteer_profile_dir AS dir FROM connections WHERE id = ?")
      .get(connectionId) as { dir: string | null };
    result.close();

    expect(usernames).toEqual([
      { id: haIds.user, username: "owner", haUserId: "ha-owner" },
      { id: windowsIds.user, username: "owner-windows", haUserId: null },
    ]);
    expect(session).toEqual({ userId: haIds.user });
    expect(profileDir.dir).toBeNull();
  });

  it("detects import bundle presence in a directory", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ha-import-"));
    const bundlePath = resolveImportFilePath(tmpDir);
    expect(isHaImportFileAvailable(tmpDir)).toBe(false);
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
    fs.writeFileSync(bundlePath, "stub");
    expect(isHaImportFileAvailable(tmpDir)).toBe(true);
  });
});

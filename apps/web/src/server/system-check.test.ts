import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, initDb, runMigrations, type MoneyTrackDb } from "@moneytrack/db";
import { runSystemChecks } from "./system-check";

async function openTempDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-syscheck-"));
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
  runMigrations();
  return {
    db,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe("runSystemChecks", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("returns contract-shaped items including runtime and database", async () => {
    const opened = await openTempDb();
    cleanup = opened.cleanup;
    const result = await runSystemChecks(opened.db);
    expect(result.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.items.length).toBeGreaterThanOrEqual(5);
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain("runtime-mode");
    expect(ids).toContain("database");
    expect(ids).toContain("storage");
    const dbItem = result.items.find((i) => i.id === "database");
    expect(dbItem?.status).toBe("pass");
  });
});

describe("runSystemChecks vault probe in file mode", () => {
  let cleanup: (() => void) | undefined;
  let keyDir: string | undefined;
  const saved = {
    vault: process.env.MONEYTRACK_VAULT,
    shm: process.env.MONEYTRACK_SHM_DB_KEY_PATH,
  };

  function restore(name: "MONEYTRACK_VAULT" | "MONEYTRACK_SHM_DB_KEY_PATH", value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    restore("MONEYTRACK_VAULT", saved.vault);
    restore("MONEYTRACK_SHM_DB_KEY_PATH", saved.shm);
    if (keyDir) {
      fs.rmSync(keyDir, { recursive: true, force: true });
      keyDir = undefined;
    }
  });

  async function vaultItem(keyBytes: Buffer | null) {
    keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-shmkey-"));
    const keyPath = path.join(keyDir, "db.key");
    if (keyBytes) {
      fs.writeFileSync(keyPath, keyBytes);
    }
    process.env.MONEYTRACK_VAULT = "file";
    process.env.MONEYTRACK_SHM_DB_KEY_PATH = keyPath;
    const opened = await openTempDb();
    cleanup = opened.cleanup;
    const result = await runSystemChecks(opened.db);
    return result.items.find((i) => i.id === "vault");
  }

  it("passes when the shared-memory DB key is readable", async () => {
    const item = await vaultItem(randomBytes(32));
    expect(item?.status).toBe("pass");
  });

  it("warns when the shared-memory DB key is missing", async () => {
    const item = await vaultItem(null);
    expect(item?.status).toBe("warn");
  });
});

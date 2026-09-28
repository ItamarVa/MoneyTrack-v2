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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isEncryptedSqliteAvailable } from "./native-support.js";

// Next's production build gives route handlers and pages separate copies of
// this module; vi.resetModules() reproduces that with two fresh imports.
describe.skipIf(!isEncryptedSqliteAvailable())("connection singleton across module copies", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    (await import("./connection.js")).closeDb();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("shares one handle, so closing it in one copy closes it for all", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-conn-"));
    vi.resetModules();
    const routeCopy = await import("./connection.js");
    vi.resetModules();
    const pageCopy = await import("./connection.js");
    expect(pageCopy).not.toBe(routeCopy);

    const db = await routeCopy.initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    expect(await pageCopy.getDb()).toBe(db);
    expect(pageCopy.getSqlite()).toBe(routeCopy.getSqlite());

    routeCopy.closeDb();
    expect(() => pageCopy.getSqlite()).toThrow("Database not initialized");
  });
});

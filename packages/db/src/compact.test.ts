import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { compactDatabaseIfNeeded } from "./compact.js";
import { closeDb, getSqlite, initDb, runMigrations } from "./connection.js";
import { isEncryptedSqliteAvailable } from "./native-support.js";
import { jobs } from "./schema.js";

describe.skipIf(!isEncryptedSqliteAvailable())("compactDatabaseIfNeeded", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  async function openDb() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-compact-"));
    const key = randomBytes(32);
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
    runMigrations();
    return { db, key };
  }

  function inflateFreelist(): void {
    const sqlite = getSqlite();
    sqlite.exec("CREATE TABLE compact_bloat (payload BLOB NOT NULL)");
    const insert = sqlite.prepare("INSERT INTO compact_bloat VALUES (?)");
    for (let i = 0; i < 200; i += 1) {
      insert.run(randomBytes(64_000));
    }
    sqlite.exec("DROP TABLE compact_bloat");
  }

  it("skips when a scrape job is running", async () => {
    const { db } = await openDb();
    inflateFreelist();
    const now = new Date().toISOString();
    db.insert(jobs)
      .values({
        id: randomUUID(),
        kind: "scrape",
        payloadJson: "{}",
        status: "running",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const result = compactDatabaseIfNeeded(db);
    expect(result.compacted).toBe(false);
    expect(result.detail).toContain("scrape running");
  });

  it("vacuums when freelist ratio exceeds threshold and DB reopens", async () => {
    const { db, key } = await openDb();
    inflateFreelist();
    const before = compactDatabaseIfNeeded(db);
    expect(before.compacted).toBe(true);

    closeDb();
    const db2 = await initDb({ dataDir: tmpDir!, key, skipGuards: true });
    db2.select().from(jobs).limit(1).all();
    closeDb();
  });

  it("does not vacuum when freelist is below threshold", async () => {
    const { db } = await openDb();
    const result = compactDatabaseIfNeeded(db);
    expect(result.compacted).toBe(false);
    expect(result.detail).toMatch(/freelist \d+\/\d+/);
  });
});

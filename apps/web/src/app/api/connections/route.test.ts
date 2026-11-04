import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDb,
  connections,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  scrapeRuns,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

// Synthetic secret: the route must probe it, never echo it.
const SECRET = '{"password":"synthetic-secret-value"}';
vi.mock("@moneytrack/vault", () => ({
  loadSecret: async (ref: string) => {
    if (ref === "moneytrack/test/with-secret") {
      return SECRET;
    }
    throw new Error(`Vault secret not found: ${ref}`);
  },
}));

import { GET } from "./route";

describe.skipIf(!isEncryptedSqliteAvailable())("GET /api/connections status fields", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-conn-route-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertConnection(credentialRef: string): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    activeDb
      .insert(connections)
      .values({
        id,
        providerCode: "isracard",
        credentialRef,
        enabled: true,
        scheduleCron: null,
        lastRunId: null,
        puppeteerProfileDir: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertRun(connectionId: string, status: string, finishedAt: string | null): void {
    activeDb
      .insert(scrapeRuns)
      .values({
        id: randomUUID(),
        connectionId,
        providerCode: "isracard",
        startedAt: finishedAt ?? "2026-01-01T00:00:00.000Z",
        finishedAt,
        status,
        errorClass: null,
        errorMessageRedacted: null,
        libraryVersion: "test",
      })
      .run();
  }

  type Item = { id: string; lastSuccessAt: string | null; credentialsSet: boolean };

  it("returns the newest successful run and whether a secret exists", async () => {
    const synced = insertConnection("moneytrack/test/with-secret");
    const never = insertConnection("moneytrack/test/no-secret");
    insertRun(synced, "success", "2026-03-01T10:00:00.000Z");
    insertRun(synced, "success", "2026-03-05T10:00:00.000Z");
    insertRun(synced, "failed", "2026-03-09T10:00:00.000Z");
    insertRun(synced, "running", null);
    insertRun(never, "failed", "2026-03-09T10:00:00.000Z");

    const response = await GET();
    const text = await response.text();
    const items = (JSON.parse(text) as { connections: Item[] }).connections;

    expect(items.find((c) => c.id === synced)).toMatchObject({
      lastSuccessAt: "2026-03-05T10:00:00.000Z",
      credentialsSet: true,
    });
    expect(items.find((c) => c.id === never)).toMatchObject({
      lastSuccessAt: null,
      credentialsSet: false,
    });
    expect(text).not.toContain("synthetic-secret-value");
  });
});

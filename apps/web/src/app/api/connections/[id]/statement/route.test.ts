import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  closeDb,
  connections,
  initDb,
  isEncryptedSqliteAvailable,
  runMigrations,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: { user: { id: null } } }),
}));

import { POST } from "./route";

const ORIGIN = "http://127.0.0.1:3100";

function upload(connectionId: string, body: BodyInit | null, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${ORIGIN}/api/connections/${connectionId}/statement`, {
      method: "POST",
      headers: { origin: ORIGIN, host: "127.0.0.1:3100", ...headers },
      body,
    }),
    { params: Promise.resolve({ id: connectionId }) },
  );
}

function fileForm(bytes: Uint8Array<ArrayBuffer>, name = "statement.xlsx"): FormData {
  const form = new FormData();
  form.append("file", new File([bytes], name));
  return form;
}

describe.skipIf(!isEncryptedSqliteAvailable())("POST /api/connections/[id]/statement", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-statement-route-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertConnection(providerCode: string): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    activeDb
      .insert(connections)
      .values({
        id,
        providerCode,
        credentialRef: "moneytrack/test/statement",
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

  it("refuses a connection whose provider has no statement upload", async () => {
    const id = insertConnection("max");
    const response = await upload(id, fileForm(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_provider" });
  });

  it("returns 404 for an unknown connection", async () => {
    const response = await upload(randomUUID(), fileForm(new Uint8Array([1])));
    expect(response.status).toBe(404);
  });

  it("refuses a file over 2 MB with 413", async () => {
    const id = insertConnection("isracard");
    const response = await upload(id, fileForm(new Uint8Array(2 * 1024 * 1024 + 1)));
    expect(response.status).toBe(413);
  });

  it("answers 400 without echoing file contents when the file is not a statement", async () => {
    const id = insertConnection("isracard");
    const marker = "synthetic-marker-text";
    const response = await upload(id, fileForm(new TextEncoder().encode(marker)));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("invalid_statement");
    expect(text).not.toContain(marker);
    expect(activeDb.select().from(transactions).all()).toHaveLength(0);
    expect(activeDb.select().from(auditLog).all()).toHaveLength(0);
  });

  it("refuses a request without the file field", async () => {
    const id = insertConnection("isracard");
    const response = await upload(id, new FormData());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_file" });
  });

  it("rejects a cross-origin request", async () => {
    const id = insertConnection("isracard");
    const response = await upload(id, fileForm(new Uint8Array([1])), { origin: "http://evil.test" });
    expect(response.status).toBe(403);
  });
});

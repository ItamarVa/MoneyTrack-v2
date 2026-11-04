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
  jobs,
  runMigrations,
  scrapeRuns,
  type MoneyTrackDb,
} from "@moneytrack/db";

let activeDb: MoneyTrackDb;
vi.mock("@/server/guard-api", () => ({
  guardApi: async () => ({ db: activeDb, session: {} }),
}));

vi.mock("@moneytrack/vault", () => ({
  loadSecret: async (ref: string) => {
    if (ref.startsWith("moneytrack/test/with-secret")) {
      return '{"password":"synthetic"}';
    }
    throw new Error(`Vault secret not found: ${ref}`);
  },
}));

import { GET, POST } from "./route";

const HOURS = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOURS).toISOString();

function postRequest(): Request {
  return new Request("http://localhost:3100/api/sync/auto", {
    method: "POST",
    headers: { host: "localhost:3100", origin: "http://localhost:3100" },
  });
}

type StartBody = { started: string[]; skipped: { connectionId: string; reason: string }[] };

describe.skipIf(!isEncryptedSqliteAvailable())("/api/sync/auto", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-auto-sync-"));
    closeDb();
    activeDb = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function addConnection(over: { credentialRef?: string; enabled?: boolean; providerCode?: string } = {}): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    activeDb
      .insert(connections)
      .values({
        id,
        providerCode: over.providerCode ?? "isracard",
        credentialRef: over.credentialRef ?? "moneytrack/test/with-secret",
        enabled: over.enabled ?? true,
        scheduleCron: null,
        lastRunId: null,
        puppeteerProfileDir: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function addRun(connectionId: string, status: string, hoursAgo: number, errorClass: string | null = null) {
    activeDb
      .insert(scrapeRuns)
      .values({
        id: randomUUID(),
        connectionId,
        providerCode: "isracard",
        startedAt: ago(hoursAgo),
        finishedAt: ago(hoursAgo),
        status,
        errorClass,
        errorMessageRedacted: null,
        libraryVersion: "test",
      })
      .run();
  }

  function addJob(connectionId: string, status: string, hoursAgo: number, errorClass: string | null = null) {
    activeDb
      .insert(jobs)
      .values({
        id: randomUUID(),
        kind: "scrape",
        payloadJson: JSON.stringify({ connectionId }),
        status,
        otpPrompt: null,
        otpResponse: null,
        attempts: 1,
        errorClass,
        createdAt: ago(hoursAgo),
        updatedAt: ago(hoursAgo),
      })
      .run();
  }

  function queuedJobs(connectionId: string) {
    return activeDb
      .select()
      .from(jobs)
      .all()
      .filter((j) => j.status === "queued" && j.payloadJson.includes(connectionId));
  }

  async function post(): Promise<StartBody> {
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    return (await response.json()) as StartBody;
  }

  it("rejects a request without a matching Origin", async () => {
    const response = await POST(new Request("http://localhost:3100/api/sync/auto", { method: "POST" }));
    expect(response.status).toBe(403);
  });

  it("starts a stale connection with a queued scrape job shaped like POST /api/sync", async () => {
    const id = addConnection();
    addRun(id, "success", 30);
    const body = await post();
    expect(body).toEqual({ started: [id], skipped: [] });
    const [job] = queuedJobs(id);
    expect(job).toMatchObject({ kind: "scrape", status: "queued", attempts: 0, errorClass: null });
  });

  it("starts a never-synced connection", async () => {
    const id = addConnection();
    expect((await post()).started).toEqual([id]);
  });

  it("skips with the right reason and enqueues nothing", async () => {
    const fresh = addConnection();
    addRun(fresh, "success", 2);
    const disabled = addConnection({ enabled: false });
    const noCreds = addConnection({ credentialRef: "moneytrack/test/none" });
    const recent = addConnection();
    addRun(recent, "failed", 30, "INVALID_PASSWORD");
    addJob(recent, "failed", 5, "SYNC_FAILED");
    const live = addConnection();
    addJob(live, "running", 0.1);
    const manual = addConnection({ providerCode: "manual", credentialRef: "moneytrack/test/none" });

    const body = await post();
    expect(body.started).toEqual([]);
    const reasons = Object.fromEntries(body.skipped.map((s) => [s.connectionId, s.reason]));
    expect(reasons).toEqual({
      [fresh]: "fresh",
      [disabled]: "disabled",
      [noCreds]: "credentials_missing",
      [recent]: "attempted_recently",
      [live]: "live_job",
    });
    expect(reasons[manual]).toBeUndefined();
    expect(activeDb.select().from(jobs).all().filter((j) => j.status === "queued")).toHaveLength(0);
  });

  it("is idempotent: a second call starts nothing", async () => {
    const id = addConnection();
    expect((await post()).started).toEqual([id]);
    const second = await post();
    expect(second.started).toEqual([]);
    expect(second.skipped).toEqual([{ connectionId: id, reason: "live_job" }]);
    expect(queuedJobs(id)).toHaveLength(1);
  });

  it("GET reports live jobs and resolves the failure class from the scrape run", async () => {
    const failed = addConnection();
    addRun(failed, "failed", 2, "INVALID_PASSWORD");
    addJob(failed, "failed", 3, "SYNC_FAILED");
    const running = addConnection();
    addJob(running, "otp_required", 0.1);
    const missing = addConnection();
    addJob(missing, "failed", 1, "CREDENTIALS_MISSING");

    const body = (await (await GET()).json()) as {
      connections: { connectionId: string; live: boolean; otpRequired: boolean; failure: { errorClass: string } | null }[];
    };
    const by = Object.fromEntries(body.connections.map((c) => [c.connectionId, c]));
    expect(by[failed]).toMatchObject({ live: false, failure: { errorClass: "INVALID_PASSWORD" } });
    expect(by[running]).toMatchObject({ live: true, otpRequired: true, failure: null });
    expect(by[missing]?.failure?.errorClass).toBe("CREDENTIALS_MISSING");
  });
});

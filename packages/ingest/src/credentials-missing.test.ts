import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDb,
  connections,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  jobs,
  runMigrations,
  scrapeRuns,
  type MoneyTrackDb,
} from "@moneytrack/db";
import type { ProviderAdapter } from "@moneytrack/providers";
import { CREDENTIALS_MISSING_ERROR_CLASS, processSyncJob } from "./sync-runner.js";

const adapter: ProviderAdapter = {
  companyId: "isracard",
  supportsOtp: false,
  async scrape() {
    throw new Error("scrape must not run without credentials");
  },
};

describe.skipIf(!isEncryptedSqliteAvailable())("processSyncJob credentials handling", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    closeDb();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  async function setup(): Promise<{ db: MoneyTrackDb; connectionId: string; jobId: string }> {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-credmissing-"));
    closeDb();
    const db = await initDb({ dataDir: tmpDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    const now = new Date().toISOString();
    const connectionId = randomUUID();
    const jobId = randomUUID();
    db.insert(connections)
      .values({
        id: connectionId,
        providerCode: "isracard",
        credentialRef: "moneytrack/test/missing",
        enabled: true,
        scheduleCron: null,
        lastRunId: null,
        puppeteerProfileDir: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(jobs)
      .values({
        id: jobId,
        kind: "scrape",
        payloadJson: JSON.stringify({ connectionId }),
        status: "queued",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { db, connectionId, jobId };
  }

  it("fails the job with CREDENTIALS_MISSING when the vault secret is absent", async () => {
    const { db, jobId } = await setup();
    await expect(
      processSyncJob(db, jobId, {
        getAdapter: () => adapter,
        loadCredentials: async (ref) => {
          throw new Error(`Vault secret not found: ${ref}`);
        },
        dataDir: tmpDir,
      }),
    ).rejects.toThrow();

    const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get()!;
    expect(job.status).toBe("failed");
    expect(job.errorClass).toBe(CREDENTIALS_MISSING_ERROR_CLASS);
    expect(job.errorClass).toBe("CREDENTIALS_MISSING");
    expect(db.select().from(scrapeRuns).all()).toHaveLength(0);
  });

  it("keeps SYNC_FAILED for other credential loading failures", async () => {
    const { db, jobId } = await setup();
    await expect(
      processSyncJob(db, jobId, {
        getAdapter: () => adapter,
        loadCredentials: async () => {
          throw new Error("Database is locked");
        },
        dataDir: tmpDir,
      }),
    ).rejects.toThrow();

    const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get()!;
    expect(job.errorClass).toBe("SYNC_FAILED");
  });
});

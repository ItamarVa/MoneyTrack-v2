/**
 * categorize_bulk completion hook: alert detectors run once when the job finishes, not per month.
 * Synthetic periods only; the rules reapply and the alerts package are mocked.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runIntelligenceDetectors } from "@moneytrack/alerts";
import {
  closeDb,
  eq,
  initDb,
  isEncryptedSqliteAvailable,
  jobs,
  runMigrations,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { advanceClassifyBulkJob, enqueueClassifyJob } from "./classify-jobs";

vi.mock("@moneytrack/alerts", () => ({
  runIntelligenceDetectors: vi.fn(() => ({
    budgetAlerts: 0,
    subscriptionsDetected: 0,
    anomalyAlerts: 0,
    duplicateAlerts: 0,
  })),
}));

vi.mock("@/server/rules-helpers", () => ({
  reapplyRulesClassificationForPeriod: vi.fn(() => ({ updated: 0, transactionIds: [] })),
}));

const detectors = vi.mocked(runIntelligenceDetectors);
const PERIODS = ["2026-03", "2026-02", "2026-01"];

describe.skipIf(!isEncryptedSqliteAvailable())("categorize_bulk completion runs alert detectors", () => {
  let dataDir = "";
  let db: MoneyTrackDb;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-classify-jobs-"));
    closeDb();
    db = await initDb({ dataDir, key: randomBytes(32), skipGuards: true });
    runMigrations();
    detectors.mockClear();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function jobStatus(jobId: string): string | undefined {
    return db.select().from(jobs).where(eq(jobs.id, jobId)).get()?.status;
  }

  it("runs detectors once on the final month, not on intermediate months", () => {
    const jobId = enqueueClassifyJob(db, PERIODS);
    expect(jobId).not.toBeNull();
    const id = jobId!;

    expect(advanceClassifyBulkJob(db, id)).toBe(false);
    expect(advanceClassifyBulkJob(db, id)).toBe(false);
    expect(detectors).not.toHaveBeenCalled();

    expect(advanceClassifyBulkJob(db, id)).toBe(true);
    expect(jobStatus(id)).toBe("done");
    expect(detectors).toHaveBeenCalledTimes(1);

    // Finished job is a no-op on later calls, so detectors do not run again.
    expect(advanceClassifyBulkJob(db, id)).toBe(true);
    expect(detectors).toHaveBeenCalledTimes(1);
  });

  it("a detector error is logged and the job still finishes as done", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    detectors.mockImplementationOnce(() => {
      throw new Error("detector boom");
    });
    const id = enqueueClassifyJob(db, ["2026-01"])!;

    expect(advanceClassifyBulkJob(db, id)).toBe(true);
    expect(jobStatus(id)).toBe("done");
    expect(detectors).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("detector boom"));
  });
});

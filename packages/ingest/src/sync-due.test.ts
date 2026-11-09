/** Due rules for both modes. Synthetic data only. */
import { describe, expect, it } from "vitest";
import { evaluateSyncDue, type SyncJobLike } from "./sync-due.js";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const conn = { id: "c1", enabled: true };

function job(
  over: Partial<{ status: string; createdAt: string; updatedAt: string; connectionId: string; kind: string }> = {},
): SyncJobLike {
  const createdAt = over.createdAt ?? hoursAgo(100);
  return {
    kind: over.kind ?? "scrape",
    status: over.status ?? "done",
    payloadJson: JSON.stringify({ connectionId: over.connectionId ?? "c1" }),
    createdAt,
    updatedAt: over.updatedAt ?? createdAt,
  };
}

const check = (over: Partial<Parameters<typeof evaluateSyncDue>[0]> = {}) =>
  evaluateSyncDue({
    connection: conn,
    jobs: [],
    now: NOW,
    mode: "on_open",
    lastSuccessAt: hoursAgo(30),
    credentialsSet: true,
    ...over,
  });

describe("evaluateSyncDue on_open", () => {
  it("is due when the last success is older than 24h", () => {
    expect(check()).toEqual({ due: true });
  });

  it("is due when it never succeeded", () => {
    expect(check({ lastSuccessAt: null })).toEqual({ due: true });
  });

  it("is fresh at exactly 24h and due just past it", () => {
    expect(check({ lastSuccessAt: hoursAgo(24) })).toEqual({ due: false, reason: "fresh" });
    expect(check({ lastSuccessAt: hoursAgo(1) })).toEqual({ due: false, reason: "fresh" });
    const justPast = new Date(NOW.getTime() - 24 * 3_600_000 - 1000).toISOString();
    expect(check({ lastSuccessAt: justPast })).toEqual({ due: true });
  });

  it("skips a connection attempted within 20h, failed included", () => {
    for (const status of ["failed", "done"]) {
      expect(check({ jobs: [job({ status, createdAt: hoursAgo(19) })] })).toEqual({
        due: false,
        reason: "attempted_recently",
      });
    }
    expect(check({ jobs: [job({ status: "failed", createdAt: hoursAgo(21) })] })).toEqual({ due: true });
  });

  it("skips a connection with a live job, but ignores one stale beyond 30 minutes", () => {
    for (const status of ["queued", "running", "otp_required"]) {
      expect(check({ jobs: [job({ status, updatedAt: NOW.toISOString() })] })).toEqual({
        due: false,
        reason: "live_job",
      });
    }
    const crashed = job({ status: "running", updatedAt: hoursAgo(1), createdAt: hoursAgo(50) });
    expect(check({ jobs: [crashed] })).toEqual({ due: true });
  });

  it("skips a connection without stored credentials", () => {
    expect(check({ credentialsSet: false })).toEqual({ due: false, reason: "credentials_missing" });
  });

  it("skips a disabled connection", () => {
    expect(check({ connection: { id: "c1", enabled: false } })).toEqual({ due: false, reason: "disabled" });
  });

  it("only counts scrape jobs of the same connection", () => {
    const other = job({ connectionId: "c2", createdAt: hoursAgo(1) });
    const refresh = job({ kind: "reference_refresh", createdAt: hoursAgo(1) });
    expect(check({ jobs: [other, refresh] })).toEqual({ due: true });
  });

  it("treats an unparseable attempt timestamp as recent", () => {
    expect(check({ jobs: [job({ createdAt: "garbage" })] })).toEqual({
      due: false,
      reason: "attempted_recently",
    });
  });
});

describe("evaluateSyncDue nightly", () => {
  it("ignores freshness: a connection synced an hour ago is still due", () => {
    expect(check({ mode: "nightly", lastSuccessAt: hoursAgo(1) })).toEqual({ due: true });
  });

  it("applies the same guards", () => {
    expect(check({ mode: "nightly", credentialsSet: false })).toEqual({
      due: false,
      reason: "credentials_missing",
    });
    expect(check({ mode: "nightly", jobs: [job({ createdAt: hoursAgo(2) })] })).toEqual({
      due: false,
      reason: "attempted_recently",
    });
  });
});

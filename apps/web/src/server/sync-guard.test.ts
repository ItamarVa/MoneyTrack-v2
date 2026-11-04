import { describe, expect, it } from "vitest";
import { SYNC_JOB_STALE_MS, hasLiveScrapeJob } from "./sync-guard.js";

const NOW = Date.parse("2026-09-12T12:00:00.000Z");

function jobRow(overrides: Partial<Parameters<typeof hasLiveScrapeJob>[0][number]> = {}) {
  return {
    kind: "scrape",
    status: "queued",
    payloadJson: JSON.stringify({ connectionId: "conn-1" }),
    updatedAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

describe("sync job concurrency guard", () => {
  it("blocks a second job while one is queued for the same connection", () => {
    expect(hasLiveScrapeJob([jobRow()], "conn-1", NOW)).toBe(true);
  });

  it("blocks while a job is running or waiting for OTP", () => {
    expect(hasLiveScrapeJob([jobRow({ status: "running" })], "conn-1", NOW)).toBe(true);
    expect(hasLiveScrapeJob([jobRow({ status: "otp_required" })], "conn-1", NOW)).toBe(true);
  });

  it("allows a job for a different connection", () => {
    expect(hasLiveScrapeJob([jobRow()], "conn-2", NOW)).toBe(false);
  });

  it("allows a new job once the previous one finished or failed", () => {
    expect(hasLiveScrapeJob([jobRow({ status: "done" })], "conn-1", NOW)).toBe(false);
    expect(hasLiveScrapeJob([jobRow({ status: "failed" })], "conn-1", NOW)).toBe(false);
  });

  it("ignores other job kinds", () => {
    expect(hasLiveScrapeJob([jobRow({ kind: "reference_refresh" })], "conn-1", NOW)).toBe(false);
  });

  it("expires a stale row so a crashed agent cannot block the connection", () => {
    const stale = jobRow({
      status: "running",
      updatedAt: new Date(NOW - SYNC_JOB_STALE_MS - 1_000).toISOString(),
    });
    expect(hasLiveScrapeJob([stale], "conn-1", NOW)).toBe(false);
  });

  it("treats an unreadable payload as unrelated", () => {
    expect(hasLiveScrapeJob([jobRow({ payloadJson: "not json" })], "conn-1", NOW)).toBe(false);
    expect(hasLiveScrapeJob([jobRow({ payloadJson: "{}" })], "conn-1", NOW)).toBe(false);
  });
});

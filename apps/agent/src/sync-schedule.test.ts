/**
 * Nightly sync scheduling: window (DST-safe), due/not-due rules, and the enqueued job shape.
 * Synthetic data only.
 */
import { describe, expect, it, vi } from "vitest";
import { connections, type MoneyTrackDb } from "@moneytrack/db";
import {
  enqueueDueSyncJobs,
  isInNightlyWindow,
  israelHour,
  selectDueConnectionIds,
} from "./sync-schedule.js";

// Summer (IDT, UTC+3): 01:00Z = 04:00 local. Winter (IST, UTC+2): 01:00Z = 03:00 local.
const SUMMER_IN = new Date("2026-07-01T01:00:00Z");
const WINTER_IN = new Date("2026-01-15T01:00:00Z");
const NOW = SUMMER_IN;

const conn = { id: "c1", enabled: true, credentialRef: "moneytrack/conn/c1" };
const yes = async (): Promise<boolean> => true;
const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function scrapeJob(
  over: Partial<{ status: string; createdAt: string; updatedAt: string; connectionId: string }> = {},
) {
  const createdAt = over.createdAt ?? "2026-06-01T00:00:00.000Z";
  return {
    kind: "scrape",
    status: over.status ?? "done",
    payloadJson: JSON.stringify({ connectionId: over.connectionId ?? "c1" }),
    createdAt,
    updatedAt: over.updatedAt ?? createdAt,
  };
}

const due = (over: Partial<Parameters<typeof selectDueConnectionIds>[0]> = {}) =>
  selectDueConnectionIds({ connections: [conn], jobs: [], now: NOW, hasSecret: yes, ...over });

describe("nightly window (Asia/Jerusalem)", () => {
  it("computes the Israel hour across DST", () => {
    expect(israelHour(new Date("2026-07-01T00:30:00Z"))).toBe(3);
    expect(israelHour(new Date("2026-01-15T00:30:00Z"))).toBe(2);
    // Spring-forward 2026-03-27 (Israel local 02:00 -> 03:00): 23:59Z is 01:59 IST, 00:00Z is 03:00 IDT.
    expect(israelHour(new Date("2026-03-26T23:59:00Z"))).toBe(1);
    expect(israelHour(new Date("2026-03-27T00:00:00Z"))).toBe(3);
  });

  it("is open 02:00-05:00 in both summer and winter", () => {
    expect(isInNightlyWindow(SUMMER_IN)).toBe(true);
    expect(isInNightlyWindow(WINTER_IN)).toBe(true);
    expect(isInNightlyWindow(new Date("2026-06-30T23:00:00Z"))).toBe(true); // 02:00 IDT
    expect(isInNightlyWindow(new Date("2026-06-30T22:59:00Z"))).toBe(false); // 01:59 IDT
    expect(isInNightlyWindow(new Date("2026-07-01T01:59:00Z"))).toBe(true); // 04:59 IDT
    expect(isInNightlyWindow(new Date("2026-07-01T02:00:00Z"))).toBe(false); // 05:00 IDT
    expect(isInNightlyWindow(new Date("2026-01-15T00:00:00Z"))).toBe(true); // 02:00 IST
    expect(isInNightlyWindow(new Date("2026-01-14T23:59:00Z"))).toBe(false); // 01:59 IST
    expect(isInNightlyWindow(new Date("2026-01-15T02:59:00Z"))).toBe(true); // 04:59 IST
    expect(isInNightlyWindow(new Date("2026-01-15T03:00:00Z"))).toBe(false); // 05:00 IST
  });
});

describe("selectDueConnectionIds", () => {
  it("returns an enabled, credentialed, idle connection inside the window", async () => {
    expect(await due()).toEqual(["c1"]);
  });

  it("returns nothing outside the window", async () => {
    expect(await due({ now: new Date("2026-07-01T09:00:00Z") })).toEqual([]);
  });

  it("skips disabled connections", async () => {
    expect(await due({ connections: [{ ...conn, enabled: false }] })).toEqual([]);
  });

  it("skips connections whose credential secret is missing", async () => {
    const hasSecret = vi.fn(async () => false);
    expect(await due({ hasSecret })).toEqual([]);
    expect(hasSecret).toHaveBeenCalledWith(conn.credentialRef);
  });

  it("skips connections with a live scrape job", async () => {
    for (const status of ["queued", "running", "otp_required"]) {
      const live = scrapeJob({ status, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: NOW.toISOString() });
      expect(await due({ jobs: [live] })).toEqual([]);
    }
  });

  it("ignores a stale live job older than 30 minutes (crashed agent)", async () => {
    const stale = scrapeJob({ status: "running", updatedAt: "2026-06-01T00:00:00.000Z" });
    expect(await due({ jobs: [stale] })).toEqual(["c1"]);
  });

  it("skips connections attempted within 20h, failed included", async () => {
    expect(await due({ jobs: [scrapeJob({ status: "failed", createdAt: hoursAgo(19) })] })).toEqual([]);
    expect(await due({ jobs: [scrapeJob({ status: "done", createdAt: hoursAgo(1) })] })).toEqual([]);
    expect(await due({ jobs: [scrapeJob({ status: "failed", createdAt: hoursAgo(21) })] })).toEqual(["c1"]);
  });

  it("only counts scrape jobs of the same connection", async () => {
    const other = scrapeJob({ connectionId: "c2", createdAt: hoursAgo(1) });
    const refresh = { ...scrapeJob({ createdAt: hoursAgo(1) }), kind: "reference_refresh" };
    expect(await due({ jobs: [other, refresh] })).toEqual(["c1"]);
  });
});

describe("enqueueDueSyncJobs", () => {
  function fakeDb(connectionRows: unknown[], jobRows: unknown[]) {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      select: () => ({
        from: (table: unknown) => ({ all: () => (table === connections ? connectionRows : jobRows) }),
      }),
      insert: () => ({
        values: (row: Record<string, unknown>) => ({ run: () => void inserted.push(row) }),
      }),
    } as unknown as MoneyTrackDb;
    return { db, inserted };
  }

  it("inserts a queued scrape job shaped like POST /api/sync", async () => {
    const { db, inserted } = fakeDb([conn], []);
    expect(await enqueueDueSyncJobs(db, NOW, yes)).toEqual(["c1"]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      kind: "scrape",
      payloadJson: JSON.stringify({ connectionId: "c1" }),
      status: "queued",
      otpPrompt: null,
      otpResponse: null,
      attempts: 0,
      errorClass: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(typeof inserted[0]!.id).toBe("string");
  });

  it("does not enqueue twice once the first job exists", async () => {
    const first = fakeDb([conn], []);
    await enqueueDueSyncJobs(first.db, NOW, yes);
    const again = fakeDb([conn], first.inserted);
    expect(await enqueueDueSyncJobs(again.db, NOW, yes)).toEqual([]);
    expect(again.inserted).toHaveLength(0);
  });
});

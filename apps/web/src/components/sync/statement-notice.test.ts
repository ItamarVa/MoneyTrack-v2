import { describe, expect, it } from "vitest";
import type { SyncConnectionState } from "./auto-sync-api";
import { needsStatementNotice, selectStatementInfo } from "./statement-notice";

const NOW = new Date("2026-11-08T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const conn = (over = {}) => ({
  id: "c1",
  providerCode: "isracard",
  enabled: true,
  lastSuccessAt: null as string | null,
  lastStatementImportAt: null as string | null,
  ...over,
});
const failed = (id = "c1"): SyncConnectionState => ({
  connectionId: id,
  providerCode: "isracard",
  live: false,
  otpRequired: false,
  failure: { errorClass: "INVALID_PASSWORD", at: daysAgo(0) },
});

describe("needsStatementNotice", () => {
  it("shows for an Isracard/Amex connection with no recent data", () => {
    expect(needsStatementNotice([conn()], NOW)).toBe(true);
    expect(needsStatementNotice([conn({ providerCode: "amex" })], NOW)).toBe(true);
  });
  it("treats an older server without the field as never imported", () => {
    const { lastStatementImportAt: _omit, ...legacy } = conn();
    expect(needsStatementNotice([legacy], NOW)).toBe(true);
  });
  it("hides after a server-reported import in the last 35 days, shows again after that", () => {
    expect(needsStatementNotice([conn({ lastStatementImportAt: daysAgo(34) })], NOW)).toBe(false);
    expect(needsStatementNotice([conn({ lastStatementImportAt: daysAgo(36) })], NOW)).toBe(true);
  });
  it("hides with a fresh sync, disabled, or other providers", () => {
    expect(needsStatementNotice([conn({ lastSuccessAt: daysAgo(1) })], NOW)).toBe(false);
    expect(needsStatementNotice([conn({ lastSuccessAt: daysAgo(4) })], NOW)).toBe(true);
    expect(needsStatementNotice([conn({ enabled: false })], NOW)).toBe(false);
    expect(needsStatementNotice([conn({ providerCode: "discount" })], NOW)).toBe(false);
  });
});

describe("selectStatementInfo", () => {
  it("returns statement connections with a failed sync", () => {
    expect(selectStatementInfo([conn()], [failed()], new Set(), NOW)).toEqual(["c1"]);
  });
  it("ignores connections without a failure, live ones, recent imports and other providers", () => {
    expect(selectStatementInfo([conn()], [], new Set(), NOW)).toEqual([]);
    expect(selectStatementInfo([conn()], [failed()], new Set(["c1"]), NOW)).toEqual([]);
    expect(
      selectStatementInfo([conn({ lastStatementImportAt: daysAgo(2) })], [failed()], new Set(), NOW),
    ).toEqual([]);
    expect(selectStatementInfo([conn({ providerCode: "discount" })], [failed()], new Set(), NOW)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { buildProblems, needsAutoSync } from "./auto-sync-rules";
import type { SyncConnectionState } from "./auto-sync-api";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function conn(over: Partial<Parameters<typeof needsAutoSync>[0][number]> = {}) {
  return {
    id: "c1",
    providerCode: "discount",
    enabled: true,
    lastSuccessAt: hoursAgo(30) as string | null,
    credentialsSet: true,
    ...over,
  };
}

function state(over: Partial<SyncConnectionState> = {}): SyncConnectionState {
  return {
    connectionId: "c1",
    providerCode: "discount",
    live: false,
    otpRequired: false,
    failure: null,
    ...over,
  };
}

describe("needsAutoSync", () => {
  it("is true when a credentialed connection is older than 24h or never synced", () => {
    expect(needsAutoSync([conn()], NOW)).toBe(true);
    expect(needsAutoSync([conn({ lastSuccessAt: null })], NOW)).toBe(true);
  });

  it("is false when fresh, disabled, manual or without credentials", () => {
    expect(needsAutoSync([conn({ lastSuccessAt: hoursAgo(2) })], NOW)).toBe(false);
    expect(needsAutoSync([conn({ enabled: false })], NOW)).toBe(false);
    expect(needsAutoSync([conn({ providerCode: "manual" })], NOW)).toBe(false);
    expect(needsAutoSync([conn({ credentialsSet: false })], NOW)).toBe(false);
    expect(needsAutoSync([], NOW)).toBe(false);
  });
});

describe("buildProblems", () => {
  it("shows the credentials message for a stale connection without a login", () => {
    const [problem] = buildProblems([conn({ credentialsSet: false })], [], NOW);
    expect(problem?.text).toContain("בנק דיסקונט");
    expect(problem?.text).toContain("פרטי התחברות");
  });

  it("maps a failed job to a Hebrew message without the raw code", () => {
    const failure = { errorClass: "INVALID_PASSWORD", at: hoursAgo(1) };
    const [problem] = buildProblems([conn()], [state({ failure })], NOW);
    expect(problem?.text).toContain("סיסמה");
    expect(problem?.text).not.toContain("INVALID_PASSWORD");
  });

  it("asks for the code when the bank waits for one", () => {
    const [problem] = buildProblems([conn()], [state({ live: true, otpRequired: true })], NOW);
    expect(problem?.text).toContain("קוד אימות");
  });

  it("shows nothing while a job runs, when fresh, or when nothing failed", () => {
    const failure = { errorClass: "TIMEOUT", at: hoursAgo(1) };
    expect(buildProblems([conn()], [state({ live: true, failure })], NOW)).toEqual([]);
    expect(buildProblems([conn({ lastSuccessAt: hoursAgo(2) })], [state({ failure })], NOW)).toEqual([]);
    expect(buildProblems([conn()], [state()], NOW)).toEqual([]);
  });
});

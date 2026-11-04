import { describe, expect, it } from "vitest";
import { evaluateStaleData } from "./stale-data";

const NOW = new Date("2026-06-10T12:00:00.000Z");

function conn(over: Partial<Parameters<typeof evaluateStaleData>[0][number]> = {}) {
  return {
    providerCode: "isracard",
    enabled: true,
    lastSuccessAt: "2026-06-09T12:00:00.000Z",
    credentialsSet: true,
    ...over,
  };
}

describe("evaluateStaleData", () => {
  it("hides when a connection synced within 3 days and all are ready", () => {
    expect(evaluateStaleData([conn()], NOW)).toEqual({ show: false });
  });

  it("hides when there are no enabled bank connections (manual only, disabled, none)", () => {
    expect(evaluateStaleData([], NOW)).toEqual({ show: false });
    expect(evaluateStaleData([conn({ enabled: false, lastSuccessAt: null })], NOW)).toEqual({
      show: false,
    });
    expect(
      evaluateStaleData([conn({ providerCode: "manual", lastSuccessAt: null })], NOW),
    ).toEqual({ show: false });
  });

  it("shows stale with the newest success date when nothing synced in 3 days", () => {
    const result = evaluateStaleData(
      [
        conn({ lastSuccessAt: "2026-04-21T09:00:00.000Z" }),
        conn({ lastSuccessAt: "2026-04-25T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(result).toEqual({ show: true, kind: "stale", since: "2026-04-25T09:00:00.000Z" });
  });

  it("treats the 3-day boundary as still fresh and just past it as stale", () => {
    expect(evaluateStaleData([conn({ lastSuccessAt: "2026-06-07T12:00:00.000Z" })], NOW)).toEqual({
      show: false,
    });
    expect(evaluateStaleData([conn({ lastSuccessAt: "2026-06-07T11:59:59.000Z" })], NOW)).toMatchObject({
      show: true,
      kind: "stale",
    });
  });

  it("shows never when no enabled connection has ever synced", () => {
    const result = evaluateStaleData(
      [conn({ lastSuccessAt: null, credentialsSet: false })],
      NOW,
    );
    expect(result).toEqual({ show: true, kind: "never", since: null });
  });

  it("shows partial when one is fresh but another never synced or lacks credentials", () => {
    expect(evaluateStaleData([conn(), conn({ lastSuccessAt: null })], NOW)).toMatchObject({
      show: true,
      kind: "partial",
    });
    expect(evaluateStaleData([conn(), conn({ credentialsSet: false })], NOW)).toMatchObject({
      show: true,
      kind: "partial",
    });
  });

  it("ignores disabled connections when deciding partial", () => {
    expect(
      evaluateStaleData([conn(), conn({ enabled: false, lastSuccessAt: null })], NOW),
    ).toEqual({ show: false });
  });
});

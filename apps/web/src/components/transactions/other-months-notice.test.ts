import { describe, expect, it } from "vitest";
import { otherMonthsCountLabel, shouldProbeAllPeriod, withoutDateBounds } from "./other-months-notice";

const base = { freeText: "BUDAPEST", allPeriod: false, loading: false, resultCount: 0 };

describe("shouldProbeAllPeriod", () => {
  it("probes for an empty searched month", () => expect(shouldProbeAllPeriod(base)).toBe(true));
  it("skips without search text", () => {
    expect(shouldProbeAllPeriod({ ...base, freeText: "  " })).toBe(false);
    expect(shouldProbeAllPeriod({ ...base, freeText: undefined })).toBe(false);
  });
  it("skips when all period, loading, or results exist", () => {
    expect(shouldProbeAllPeriod({ ...base, allPeriod: true })).toBe(false);
    expect(shouldProbeAllPeriod({ ...base, loading: true })).toBe(false);
    expect(shouldProbeAllPeriod({ ...base, resultCount: 3 })).toBe(false);
  });
});

describe("withoutDateBounds", () => {
  it("drops dates and keeps the rest", () => {
    expect(
      withoutDateBounds({ dateBasis: "charge", dateFrom: "2026-10-01", dateTo: "2026-10-31", freeText: "x" }),
    ).toEqual({ dateBasis: "charge", freeText: "x" });
  });
});

describe("otherMonthsCountLabel", () => {
  it("returns null for no hits", () => expect(otherMonthsCountLabel(0, false)).toBeNull());
  it("plain count", () => expect(otherMonthsCountLabel(25, false)).toBe("25"));
  it("capped count gets plus", () => expect(otherMonthsCountLabel(200, true)).toBe("200+"));
  it("prefers server total", () => expect(otherMonthsCountLabel(200, true, 340)).toBe("340"));
});

import { describe, expect, it } from "vitest";
import { buildUsualMonth, compareToUsual, median, previousPeriods } from "./usual-month";

describe("median", () => {
  it("takes the middle value of an odd list and ignores outliers", () => {
    expect(median([5, 1, 100])).toBe(5);
  });

  it("averages the two middle values of an even list", () => {
    expect(median([1000, 2000, 3000, 4000, 5000, 100000])).toBe(3500);
  });

  it("is null for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("previousPeriods", () => {
  it("walks back across a year boundary, newest first", () => {
    expect(previousPeriods("2026-02", 4)).toEqual(["2026-01", "2025-12", "2025-11", "2025-10"]);
  });

  it("defaults to six months", () => {
    expect(previousPeriods("2026-11")).toHaveLength(6);
  });
});

describe("buildUsualMonth", () => {
  it("needs at least two months", () => {
    expect(buildUsualMonth([1000], null)).toBeNull();
    expect(buildUsualMonth([], null)).toBeNull();
  });

  it("reports the median, month count and cut-off day", () => {
    expect(buildUsualMonth([100, 300], 10)).toEqual({
      medianIls: 200,
      monthsUsed: 2,
      comparedThroughDay: 10,
    });
  });
});

describe("compareToUsual", () => {
  it("reads above and below in whole percent", () => {
    expect(compareToUsual(4200, 3500)).toEqual({ direction: "above", pct: 20 });
    expect(compareToUsual(2800, 3500)).toEqual({ direction: "below", pct: 20 });
  });

  it("reads under half a percent as the same", () => {
    expect(compareToUsual(3501, 3500)).toEqual({ direction: "same", pct: 0 });
  });

  it("has nothing to compare with when the usual month is zero", () => {
    expect(compareToUsual(100, 0)).toBeNull();
  });
});

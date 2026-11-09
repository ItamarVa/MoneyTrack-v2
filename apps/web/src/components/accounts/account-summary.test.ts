import { describe, expect, it } from "vitest";
import { summarizeAccount, trendBarHeights, trendPeriods, trendWindow } from "./account-summary";

const tx = (date: string, direction: "debit" | "credit", amountIls: number, excluded = false) => ({
  transactionDate: date,
  direction,
  amountIls,
  excludedFromTotals: excluded,
});

describe("trendPeriods", () => {
  it("returns six months oldest first across a year boundary", () => {
    expect(trendPeriods("2026-02")).toEqual([
      "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
  });
});

describe("trendWindow", () => {
  it("spans first day of oldest month to last day of end month", () => {
    expect(trendWindow("2026-02")).toEqual({ dateFrom: "2025-09-01", dateTo: "2026-02-28" });
  });
});

describe("summarizeAccount", () => {
  const txns = [
    tx("2026-02-03", "debit", 100),
    tx("2026-02-10", "credit", 40),
    tx("2026-02-20", "debit", 50, true),
    tx("2026-01-15", "debit", 200),
    tx("2025-01-01", "debit", 999),
  ];

  it("sums the selected month and ignores excluded and out-of-window rows", () => {
    const s = summarizeAccount(txns, "2026-02");
    expect(s).toMatchObject({ moneyIn: 40, moneyOut: 100, net: 60, count: 2, lastActivity: "2026-02-10" });
    expect(s.trend.at(-1)).toEqual({ period: "2026-02", out: 60 });
    expect(s.trend.at(-2)).toEqual({ period: "2026-01", out: 200 });
  });

  it("covers the whole window when asked", () => {
    const s = summarizeAccount(txns, "2026-02", true);
    expect(s.count).toBe(3);
    expect(s.moneyOut).toBe(300);
  });

  it("handles no transactions", () => {
    const s = summarizeAccount([], "2026-02");
    expect(s).toMatchObject({ count: 0, lastActivity: null, moneyIn: 0, moneyOut: 0 });
  });
});

describe("trendBarHeights", () => {
  it("scales to the max with a floor for nonzero months", () => {
    const heights = trendBarHeights([
      { period: "a", out: 0 },
      { period: "b", out: 1 },
      { period: "c", out: 100 },
    ]);
    expect(heights).toEqual([0, 8, 100]);
  });
  it("returns zeros when nothing was spent", () => {
    expect(trendBarHeights([{ period: "a", out: 0 }])).toEqual([0]);
  });
});

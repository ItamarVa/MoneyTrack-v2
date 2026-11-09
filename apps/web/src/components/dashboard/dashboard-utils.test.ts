import { describe, expect, it } from "vitest";
import type { CreditSummaryResponse } from "@/components/credit/credit-types";
import {
  allHistorySentence,
  allPeriodSummaryLine,
  formatDayMonth,
  monthSummarySentence,
  nextCardCharge,
  pickAxisTicks,
  resolveMonthDataState,
  usualMonthNote,
} from "./dashboard-utils";

const base = { currentPeriod: "2026-11", totalIncomeIls: 0, totalExpensesIls: 0 };

describe("resolveMonthDataState", () => {
  it("treats the whole-history period as its own state", () => {
    expect(resolveMonthDataState({ ...base, period: "all" })).toBe("all");
  });

  it("flags a month with no income and no expenses as empty", () => {
    expect(resolveMonthDataState({ ...base, period: "2026-10" })).toBe("empty");
  });

  it("flags an empty current month as empty, not partial", () => {
    expect(resolveMonthDataState({ ...base, period: "2026-11" })).toBe("empty");
  });

  it("flags the current month with data as partial", () => {
    expect(
      resolveMonthDataState({ ...base, period: "2026-11", totalExpensesIls: 1200 }),
    ).toBe("partial");
  });

  it("flags a past month with data as complete", () => {
    expect(
      resolveMonthDataState({ ...base, period: "2026-10", totalIncomeIls: 15000, totalExpensesIls: 900 }),
    ).toBe("complete");
  });

  it("counts income-only months as having data", () => {
    expect(resolveMonthDataState({ ...base, period: "2026-09", totalIncomeIls: 500 })).toBe("complete");
  });
});

describe("allPeriodSummaryLine", () => {
  it("names the first month with data", () => {
    expect(allPeriodSummaryLine("2025-03")).toMatch(/^סיכום מאז .*2025/);
  });

  it("falls back when there is no data", () => {
    expect(allPeriodSummaryLine(undefined)).toBe("סיכום של כל הנתונים");
  });
});

const usual = { medianIls: 3500, monthsUsed: 6, comparedThroughDay: null };

describe("monthSummarySentence", () => {
  it("says so far for the month in progress and compares with a usual month", () => {
    const text = monthSummarySentence({
      spentIls: 4200,
      periodLabel: "נובמבר 2026",
      inProgress: true,
      usualMonth: usual,
    });
    expect(text).toContain("הוצאתם עד כה");
    expect(text).toContain("החודש");
    expect(text).toContain("20% מעל חודש רגיל");
  });

  it("names the month for a finished month and says below when under", () => {
    const text = monthSummarySentence({
      spentIls: 2800,
      periodLabel: "אוקטובר 2026",
      inProgress: false,
      usualMonth: usual,
    });
    expect(text).toContain("בחודש אוקטובר 2026");
    expect(text).not.toContain("עד כה");
    expect(text).toContain("20% מתחת לחודש רגיל");
  });

  it("says same when within half a percent", () => {
    expect(
      monthSummarySentence({ spentIls: 3500, periodLabel: "x", inProgress: false, usualMonth: usual }),
    ).toContain("כמו חודש רגיל");
  });

  it("drops the comparison when there is no usual month", () => {
    const text = monthSummarySentence({
      spentIls: 500,
      periodLabel: "x",
      inProgress: true,
      usualMonth: null,
    });
    expect(text).not.toContain("—");
    expect(text).not.toContain("חודש רגיל");
  });
});

describe("usualMonthNote", () => {
  it("explains the median, and the same-day cut-off for a month in progress", () => {
    expect(usualMonthNote(usual)).toContain("6 החודשים");
    expect(usualMonthNote({ ...usual, comparedThroughDay: 10 })).toContain("אותו יום בחודש");
  });
});

describe("allHistorySentence", () => {
  const row = (period: string, expensesIls: number) => ({ period, expensesIls, incomeIls: 0, netIls: 0 });

  it("averages over months that had expenses", () => {
    const text = allHistorySentence([row("2026-01", 1000), row("2026-02", 0), row("2026-03", 3000)]);
    expect(text).toContain("ממוצע חודשי");
    expect(text).toContain("2,000");
    expect(text).toContain("ב-2 חודשים");
  });

  it("uses singular for one month and null for none", () => {
    expect(allHistorySentence([row("2026-01", 1000)])).toContain("בחודש אחד");
    expect(allHistorySentence([])).toBeNull();
  });
});

describe("nextCardCharge", () => {
  const card = (kind: "upcoming" | "last" | "none", date: string | null, amountIls: number) => ({
    accountId: "a",
    displayName: "card",
    institutionCode: "x",
    numberLast4: null,
    charge: { kind, date, amountIls, transactionCount: 1 },
  });

  it("takes the earliest upcoming date and sums cards billed that day", () => {
    const summary: CreditSummaryResponse = {
      today: "2026-11-04",
      cards: [
        card("upcoming", "2026-11-10", 300),
        card("upcoming", "2026-11-10", 200),
        card("upcoming", "2026-11-15", 999),
        card("last", "2026-10-10", 50),
      ],
    };
    expect(nextCardCharge(summary)).toEqual({ date: "2026-11-10", amountIls: 500 });
  });

  it("is null when nothing is upcoming", () => {
    expect(nextCardCharge({ today: "2026-11-04", cards: [card("last", "2026-10-10", 50)] })).toBeNull();
  });
});

describe("chart axis helpers", () => {
  it("formats a short day/month label", () => {
    expect(formatDayMonth("2026-11-05")).toBe("5/11");
  });

  it("thins labels to the maximum, keeping first and last", () => {
    const labels = Array.from({ length: 30 }, (_, i) => `${i + 1}/11`);
    const ticks = pickAxisTicks(labels, 4);
    expect(ticks).toHaveLength(4);
    expect(ticks[0]).toBe("1/11");
    expect(ticks.at(-1)).toBe("30/11");
  });

  it("keeps everything when under the maximum", () => {
    expect(pickAxisTicks(["1/11", "2/11"], 4)).toEqual(["1/11", "2/11"]);
  });
});

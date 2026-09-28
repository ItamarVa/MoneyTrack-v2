import { describe, expect, it } from "vitest";
import { FIXTURE_MONTHLY_SERIES } from "./fixtures/chart-fixtures";
import {
  alignYearOverYear,
  buildYoYSummaryLine,
  computeTwelveMonthExpenseAverage,
  hasPriorYearData,
} from "./monthly-utils";

describe("alignYearOverYear", () => {
  it("pairs current-year months with the same month last year", () => {
    const rows = alignYearOverYear(FIXTURE_MONTHLY_SERIES);
    const august = rows.find((row) => row.month === 8);
    expect(august?.currentExpenses).toBe(11810);
    expect(august?.priorExpenses).toBe(10900);
    expect(august?.yoyExpensePct).toBeCloseTo(
      ((august!.currentExpenses - august!.priorExpenses!) / august!.priorExpenses!) * 100,
      1,
    );
  });

  it("detects prior-year availability", () => {
    const rows = alignYearOverYear(FIXTURE_MONTHLY_SERIES);
    expect(hasPriorYearData(rows)).toBe(true);
  });

  it("builds a Hebrew summary line", () => {
    const rows = alignYearOverYear(FIXTURE_MONTHLY_SERIES);
    const line = buildYoYSummaryLine(rows);
    expect(line).toMatch(/מאשתקד/);
    expect(computeTwelveMonthExpenseAverage(rows)).toBeGreaterThan(0);
  });

  it("accumulates year-to-date expenses through the calendar year", () => {
    const rows = alignYearOverYear(FIXTURE_MONTHLY_SERIES);
    const january = rows.find((row) => row.month === 1);
    const august = rows.find((row) => row.month === 8);
    expect(january?.currentExpensesYtd).toBe(january?.currentExpenses);
    const expectedAugustYtd = rows
      .filter((row) => row.month <= 8)
      .reduce((sum, row) => sum + row.currentExpenses, 0);
    expect(august?.currentExpensesYtd).toBe(expectedAugustYtd);
  });
});

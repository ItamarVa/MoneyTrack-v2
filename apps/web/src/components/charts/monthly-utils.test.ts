import { describe, expect, it } from "vitest";
import type { MonthlySeriesPoint } from "@moneytrack/contracts";
import { FIXTURE_MONTHLY_SERIES } from "./fixtures/chart-fixtures";
import {
  alignYearOverYear,
  buildYoYSummaryLine,
  computeTwelveMonthExpenseAverage,
  computeYoYSummary,
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

  it("omits the percentage when fewer than 10 months are comparable", () => {
    const rows = alignYearOverYear(FIXTURE_MONTHLY_SERIES);
    const line = buildYoYSummaryLine(rows);
    expect(line).not.toMatch(/%/);
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

function series(currentMonths: number, priorMonths: number, prior = 1000, current = 1200): MonthlySeriesPoint[] {
  const point = (year: number, month: number, expenses: number): MonthlySeriesPoint => ({
    period: `${year}-${String(month).padStart(2, "0")}`,
    expensesIls: expenses,
    incomeIls: 0,
    netIls: -expenses,
  });
  return [
    ...Array.from({ length: currentMonths }, (_, i) => point(2026, i + 1, current)),
    ...Array.from({ length: priorMonths }, (_, i) => point(2025, i + 1, prior)),
  ];
}

describe("computeYoYSummary gating", () => {
  it("withholds the percentage when the prior year has too few months", () => {
    const rows = alignYearOverYear(series(9, 2, 10));
    const summary = computeYoYSummary(rows);
    expect(summary.pct).toBeNull();
    expect(buildYoYSummaryLine(rows)).not.toMatch(/%/);
  });

  it("withholds the percentage at 9 comparable months", () => {
    expect(computeYoYSummary(alignYearOverYear(series(9, 12))).pct).toBeNull();
  });

  it("shows the percentage at 10 comparable months and names that month count", () => {
    const rows = alignYearOverYear(series(10, 12));
    const summary = computeYoYSummary(rows);
    expect(summary.months).toBe(10);
    expect(summary.pct).toBeCloseTo(20, 5);
    const line = buildYoYSummaryLine(rows);
    expect(line).toContain("ב-10 החודשים");
    expect(line).toContain("20%");
  });

  it("compares only months present on both sides", () => {
    // Prior year has all 12 months, current only 10: prior total is limited to those 10.
    const summary = computeYoYSummary(alignYearOverYear(series(10, 12, 500, 1000)));
    expect(summary.pct).toBeCloseTo(100, 5);
  });
});

/**
 * Unit tests for the salary reporting-period window (25–5 rule).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALARY_REPORTING_SETTINGS,
  reportingPeriodFromChargeDate,
} from "./salary-reporting.js";

describe("reportingPeriodFromChargeDate", () => {
  it("maps 28/09 to October (day >= 25)", () => {
    expect(
      reportingPeriodFromChargeDate("2026-09-28", DEFAULT_SALARY_REPORTING_SETTINGS),
    ).toBe("2026-10");
  });

  it("maps 03/10 to October (day <= 5)", () => {
    expect(
      reportingPeriodFromChargeDate("2026-10-03", DEFAULT_SALARY_REPORTING_SETTINGS),
    ).toBe("2026-10");
  });

  it("maps 20/09 to September (outside window)", () => {
    expect(
      reportingPeriodFromChargeDate("2026-09-20", DEFAULT_SALARY_REPORTING_SETTINGS),
    ).toBe("2026-09");
  });

  it("uses charge calendar month when rule is disabled", () => {
    expect(
      reportingPeriodFromChargeDate("2026-09-28", {
        ...DEFAULT_SALARY_REPORTING_SETTINGS,
        enabled: false,
      }),
    ).toBe("2026-09");
  });

  it("never overflows on the last day of 31-day months", () => {
    const cases: Array<[string, string]> = [
      ["2026-01-31", "2026-02"],
      ["2026-03-31", "2026-04"],
      ["2026-05-31", "2026-06"],
      ["2026-07-31", "2026-08"],
      ["2026-08-31", "2026-09"],
      ["2026-10-31", "2026-11"],
    ];
    for (const [charge, expected] of cases) {
      expect(reportingPeriodFromChargeDate(charge)).toBe(expected);
    }
  });

  it("handles the 30th, Feb 28/29 and December rollover", () => {
    expect(reportingPeriodFromChargeDate("2026-09-30")).toBe("2026-10");
    expect(reportingPeriodFromChargeDate("2026-02-28")).toBe("2026-03");
    expect(reportingPeriodFromChargeDate("2028-02-29")).toBe("2028-03");
    expect(reportingPeriodFromChargeDate("2026-12-31")).toBe("2027-01");
    expect(reportingPeriodFromChargeDate("2026-12-25")).toBe("2027-01");
  });

  it("respects custom window settings", () => {
    const custom = { enabled: true, startDay: 30, endDay: 2 };
    expect(reportingPeriodFromChargeDate("2026-08-29", custom)).toBe("2026-08");
    expect(reportingPeriodFromChargeDate("2026-08-31", custom)).toBe("2026-09");
  });
});

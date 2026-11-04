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
});

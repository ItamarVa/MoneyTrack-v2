/**
 * Pure salary reporting-period logic: maps a charge date to a YYYY-MM display month
 * using the configurable late-month / early-month window (default days 25–5).
 * Consumed by rollups and ingest; no DB access here.
 */
import type { SalaryReportingSettings } from "@moneytrack/contracts";
import { periodFromDate, shiftMonths } from "./dates.js";

export const DEFAULT_SALARY_REPORTING_SETTINGS: SalaryReportingSettings = {
  enabled: true,
  startDay: 25,
  endDay: 5,
};

/**
 * Apply the 25–5 window rule to a charge date.
 * day >= startDay → month(charge) + 1
 * day <= endDay   → month(charge)
 * else            → month(charge)
 */
export function reportingPeriodFromChargeDate(
  chargeDate: string,
  settings: SalaryReportingSettings = DEFAULT_SALARY_REPORTING_SETTINGS,
): string {
  if (!settings.enabled) {
    return periodFromDate(chargeDate);
  }

  const day = Number.parseInt(chargeDate.slice(8, 10), 10);

  if (day >= settings.startDay) {
    return periodFromDate(shiftMonths(chargeDate, 1));
  }
  if (day <= settings.endDay) {
    return periodFromDate(chargeDate);
  }
  return periodFromDate(chargeDate);
}

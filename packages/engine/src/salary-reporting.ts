/**
 * Pure salary reporting-period logic: maps a charge date to a YYYY-MM display month
 * using the configurable late-month / early-month window (default days 25–5).
 * Consumed by rollups and ingest; no DB access here.
 */
import type { SalaryReportingSettings } from "@moneytrack/contracts";
import { periodFromDate } from "./dates.js";

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
// Integer month math: Date#setMonth on day 31 overflows into the month after next.
function nextPeriod(chargeDate: string): string {
  const year = Number.parseInt(chargeDate.slice(0, 4), 10);
  const month = Number.parseInt(chargeDate.slice(5, 7), 10);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function reportingPeriodFromChargeDate(
  chargeDate: string,
  settings: SalaryReportingSettings = DEFAULT_SALARY_REPORTING_SETTINGS,
): string {
  if (!settings.enabled) {
    return periodFromDate(chargeDate);
  }

  const day = Number.parseInt(chargeDate.slice(8, 10), 10);

  if (day >= settings.startDay) {
    return nextPeriod(chargeDate);
  }
  if (day <= settings.endDay) {
    return periodFromDate(chargeDate);
  }
  return periodFromDate(chargeDate);
}

/**
 * Shared date formatting for UI panels. Uses Hebrew locale without bidi marks in output.
 */
import he from "@/locales/he.json";

const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthYearFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return shortDateFormatter.format(new Date(year!, month! - 1, day));
}

/**
 * "YYYY-MM" (or a full ISO date) becomes "<month> <year>". An all-period filter has no
 * bounds, so callers pass "" or "all": those become the all-period label instead of
 * letting Intl throw `RangeError: Invalid time value`.
 */
export function formatMonthYear(period: string): string {
  if (!/^\d{4}-\d{2}/.test(period)) return he.allPeriod.label;
  const [year, month] = period.split("-").map(Number);
  return monthYearFormatter.format(new Date(year!, month! - 1, 1));
}

export function formatIsoDateTime(isoDateTime: string): string {
  return shortDateFormatter.format(new Date(isoDateTime));
}

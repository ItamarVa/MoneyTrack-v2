/**
 * Shared date formatting for UI panels. Uses Hebrew locale without bidi marks in output.
 */
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

export function formatMonthYear(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return monthYearFormatter.format(new Date(year!, month! - 1, 1));
}

export function formatIsoDateTime(isoDateTime: string): string {
  return shortDateFormatter.format(new Date(isoDateTime));
}

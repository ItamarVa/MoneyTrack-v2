/**
 * Shift an ISO date by N calendar months, clamping the day to the target
 * month's length (Jan 31 + 1 -> Feb 28/29, Aug 31 + 1 -> Sep 30). Same rule as
 * moment's `add(n, "month")`, which israeli-bank-scrapers uses to shift
 * installment dates, so `reverseInstallmentDateShift` stays its inverse.
 * `Date#setUTCMonth` would overflow instead (Aug 31 + 1 -> Oct 1).
 */
export function shiftMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function periodFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function withinDays(a: string, b: string, window: number): boolean {
  const start = addDays(a, -window);
  const end = addDays(a, window);
  return b >= start && b <= end;
}

export function nowIso(): string {
  return new Date().toISOString();
}

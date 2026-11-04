/** Shift an ISO date by N calendar months (UTC noon anchor). */
export function shiftMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
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

import type { MoneyTrackDb } from "@moneytrack/db";
import { refreshBoi } from "./refresh-boi.js";
import { hasFreshCpiForMonth, refreshCpi } from "./refresh-cpi.js";
import { refreshFx } from "./refresh-fx.js";
import { refreshFunds } from "./refresh-funds.js";

let lastDailyRunDate: string | null = null;

export function isCpiRetryWindow(date: Date): boolean {
  const day = date.getDate();
  return day >= 13 && day <= 20;
}

export function shouldRunDailyRefresh(todayKey: string): boolean {
  return lastDailyRunDate !== todayKey;
}

export function resetSchedulerState(): void {
  lastDailyRunDate = null;
}

export type ScheduledRefreshResult = {
  ran: string[];
};

export async function runScheduledReferenceRefresh(
  db: MoneyTrackDb,
): Promise<ScheduledRefreshResult> {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const ran: string[] = [];

  if (shouldRunDailyRefresh(todayKey)) {
    await refreshBoi(db);
    await refreshFx(db);
    lastDailyRunDate = todayKey;
    ran.push("boi", "fx");
  }

  if (
    isCpiRetryWindow(now) &&
    !hasFreshCpiForMonth(db, now.getFullYear(), now.getMonth() + 1)
  ) {
    await refreshCpi(db);
    ran.push("cpi");
  }

  return { ran };
}

export type FullReferenceRefreshResult = {
  boi: Awaited<ReturnType<typeof refreshBoi>>;
  fx: Awaited<ReturnType<typeof refreshFx>>;
  cpi: Awaited<ReturnType<typeof refreshCpi>>;
  funds: Awaited<ReturnType<typeof refreshFunds>>;
};

export async function runFullReferenceRefresh(
  db: MoneyTrackDb,
): Promise<FullReferenceRefreshResult> {
  const boi = await refreshBoi(db);
  const fx = await refreshFx(db);
  const cpi = await refreshCpi(db);
  const funds = await refreshFunds(db);
  return { boi, fx, cpi, funds };
}

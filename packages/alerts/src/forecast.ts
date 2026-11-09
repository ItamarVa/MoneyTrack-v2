import { loanScheduleRows, loanTracks, recurringInstruments, type MoneyTrackDb } from "@moneytrack/db";

export type CashflowForecastPoint = {
  date: string;
  amountIls: number;
  source: "recurring" | "loan";
  label: string;
};

export type CashflowForecast = {
  horizonDays: number;
  totalOutflowIls: number;
  points: CashflowForecastPoint[];
};

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextMonthlyDate(from: string): string {
  const [year, month, day] = from.split("-").map(Number);
  const next = new Date(year!, month!, day!);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString().slice(0, 10);
}

export function forecastCashflow(db: MoneyTrackDb, horizonDays = 90): CashflowForecast {
  const today = new Date().toISOString().slice(0, 10);
  const end = addDays(today, horizonDays);
  const points: CashflowForecastPoint[] = [];

  for (const instrument of db.select().from(recurringInstruments).all()) {
    if (instrument.status !== "active" || !instrument.lastSeen) {
      continue;
    }

    let cursor = instrument.lastSeen;
    while (cursor <= end) {
      cursor = nextMonthlyDate(cursor);
      if (cursor < today || cursor > end) {
        continue;
      }
      points.push({
        date: cursor,
        amountIls: instrument.expectedAmount,
        source: "recurring",
        label: instrument.merchantId ?? "הוראת קבע",
      });
    }
  }

  const trackIds = new Set(db.select().from(loanTracks).all().map((row) => row.id));
  for (const row of db.select().from(loanScheduleRows).all()) {
    if (!trackIds.has(row.trackId)) {
      continue;
    }
    if (row.dueDate < today || row.dueDate > end) {
      continue;
    }
    const payment = row.principalPart + row.interestPart + row.cpiAdjustment;
    points.push({
      date: row.dueDate,
      amountIls: payment,
      source: "loan",
      label: "תשלום הלוואה",
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const totalOutflowIls = points.reduce((sum, point) => sum + point.amountIls, 0);

  return { horizonDays, totalOutflowIls, points };
}

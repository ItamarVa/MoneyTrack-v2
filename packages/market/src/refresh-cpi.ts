import { z } from "zod";
import {
  eq,
  referenceObservations,
  referenceSeries,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { egressFetch } from "@moneytrack/egress";
import { CBS_CPI_URL } from "./config.js";
import { ensureSeries, hashResponseBody, insertObservation } from "./series-store.js";
import type { MarketFetch } from "./refresh-boi.js";

const CpiMonthSchema = z.object({
  year: z.number(),
  month: z.number(),
  percentYear: z.number().optional(),
  currBase: z.object({
    value: z.number(),
    baseDesc: z.string().optional(),
  }),
});

const CpiResponseSchema = z.object({
  month: z.array(
    z.object({
      date: z.array(CpiMonthSchema),
    }),
  ),
});

export type RefreshCpiResult = {
  latestAsOf: string | null;
  latestIndex: number | null;
  latestYoy: number | null;
  inserted: number;
};

function monthAsOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function hasFreshCpiForMonth(db: MoneyTrackDb, year: number, month: number): boolean {
  const asOfPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const series = db
    .select()
    .from(referenceSeries)
    .where(eq(referenceSeries.seriesCode, "cpi_general"))
    .get();
  if (!series) {
    return false;
  }

  return db
    .select()
    .from(referenceObservations)
    .where(eq(referenceObservations.seriesId, series.id))
    .all()
    .some((row) => row.asOf.startsWith(asOfPrefix));
}

export async function refreshCpi(
  db: MoneyTrackDb,
  fetchFn: MarketFetch = egressFetch,
): Promise<RefreshCpiResult> {
  const response = await fetchFn(CBS_CPI_URL, "ref_cpi_general");
  if (!response.ok) {
    throw new Error(`CBS CPI failed: HTTP ${response.status}`);
  }

  const raw = await response.text();
  const payload = CpiResponseSchema.parse(JSON.parse(raw));
  const sha = hashResponseBody(raw);
  const fetchedAt = new Date().toISOString();
  const indexSeriesId = ensureSeries(db, "cpi_general", "CPI general index", "index");
  const yoySeriesId = ensureSeries(db, "cpi_yoy", "CPI year-over-year", "%");
  let inserted = 0;
  let latestAsOf: string | null = null;
  let latestIndex: number | null = null;
  let latestYoy: number | null = null;

  const points = payload.month.flatMap((group) => group.date);
  points.sort((a, b) => monthAsOf(a.year, a.month).localeCompare(monthAsOf(b.year, b.month)));

  for (const point of points) {
    const asOf = monthAsOf(point.year, point.month);
    if (
      insertObservation(
        db,
        indexSeriesId,
        asOf,
        point.currBase.value,
        CBS_CPI_URL,
        sha,
        fetchedAt,
      )
    ) {
      inserted += 1;
    }

    if (point.percentYear != null) {
      if (
        insertObservation(
          db,
          yoySeriesId,
          asOf,
          point.percentYear,
          CBS_CPI_URL,
          sha,
          fetchedAt,
        )
      ) {
        inserted += 1;
      }
      latestYoy = point.percentYear;
    }

    latestAsOf = asOf;
    latestIndex = point.currBase.value;
  }

  return { latestAsOf, latestIndex, latestYoy, inserted };
}

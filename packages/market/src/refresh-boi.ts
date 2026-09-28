import { z } from "zod";
import type { MoneyTrackDb } from "@moneytrack/db";
import { egressFetch } from "@moneytrack/egress";
import { BOI_INTEREST_URL, PRIME_SPREAD } from "./config.js";
import { ensureSeries, hashResponseBody, insertObservation } from "./series-store.js";

const BoiInterestSchema = z.object({
  currentInterest: z.number(),
  nextInterestDate: z.string().optional(),
  lastPublishedDate: z.string().optional(),
});

export type MarketFetch = typeof egressFetch;

export type RefreshBoiResult = {
  boiRate: number;
  prime: number;
  asOf: string;
  inserted: number;
};

function observationAsOf(payload: z.infer<typeof BoiInterestSchema>): string {
  if (payload.lastPublishedDate) {
    return payload.lastPublishedDate.slice(0, 10);
  }
  if (payload.nextInterestDate) {
    return payload.nextInterestDate.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export async function refreshBoi(
  db: MoneyTrackDb,
  fetchFn: MarketFetch = egressFetch,
): Promise<RefreshBoiResult> {
  const response = await fetchFn(BOI_INTEREST_URL, "ref_boi_rate");
  if (!response.ok) {
    throw new Error(`BOI GetInterest failed: HTTP ${response.status}`);
  }

  const raw = await response.text();
  const payload = BoiInterestSchema.parse(JSON.parse(raw));
  const sha = hashResponseBody(raw);
  const asOf = observationAsOf(payload);
  const fetchedAt = new Date().toISOString();
  let inserted = 0;

  const boiSeriesId = ensureSeries(db, "boi_rate", "BOI policy rate", "%");
  if (
    insertObservation(
      db,
      boiSeriesId,
      asOf,
      payload.currentInterest,
      BOI_INTEREST_URL,
      sha,
      fetchedAt,
    )
  ) {
    inserted += 1;
  }

  const prime = payload.currentInterest + PRIME_SPREAD;
  const primeSeriesId = ensureSeries(db, "prime", "Prime rate", "%");
  if (
    insertObservation(db, primeSeriesId, asOf, prime, BOI_INTEREST_URL, sha, fetchedAt)
  ) {
    inserted += 1;
  }

  return { boiRate: payload.currentInterest, prime, asOf, inserted };
}

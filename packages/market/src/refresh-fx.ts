import { z } from "zod";
import type { MoneyTrackDb } from "@moneytrack/db";
import { egressFetch } from "@moneytrack/egress";
import { BOI_FX_URL, FX_SERIES_CODES } from "./config.js";
import { ensureSeries, hashResponseBody, insertObservation } from "./series-store.js";
import type { MarketFetch } from "./refresh-boi.js";

const BoiFxSchema = z.object({
  exchangeRates: z.array(
    z.object({
      key: z.string(),
      currentExchangeRate: z.number(),
      unit: z.number().optional(),
      lastUpdate: z.string().optional(),
    }),
  ),
});

const FrankfurterSchema = z.object({
  rates: z.record(z.number()),
});

export type RefreshFxResult = {
  inserted: number;
  currencies: string[];
  usedFallback: boolean;
};

function fxSeriesCode(currency: string): string {
  return FX_SERIES_CODES[currency] ?? `fx_${currency.toLowerCase()}_ils`;
}

function fxAsOf(lastUpdate: string | undefined): string {
  if (lastUpdate) {
    return lastUpdate.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function fetchFrankfurterRate(
  currency: string,
  fetchFn: MarketFetch,
): Promise<number | null> {
  const url = `https://api.frankfurter.dev/latest?from=${currency}&to=ILS`;
  const response = await fetchFn(url, "ref_fx_frankfurter_fallback");
  if (!response.ok) {
    return null;
  }
  const raw = await response.text();
  const payload = FrankfurterSchema.parse(JSON.parse(raw));
  return payload.rates.ILS ?? null;
}

export async function refreshFx(
  db: MoneyTrackDb,
  fetchFn: MarketFetch = egressFetch,
): Promise<RefreshFxResult> {
  const response = await fetchFn(BOI_FX_URL, "ref_fx_boi");
  if (!response.ok) {
    throw new Error(`BOI GetExchangeRates failed: HTTP ${response.status}`);
  }

  const raw = await response.text();
  const payload = BoiFxSchema.parse(JSON.parse(raw));
  const sha = hashResponseBody(raw);
  const fetchedAt = new Date().toISOString();
  let inserted = 0;
  let usedFallback = false;
  const currencies: string[] = [];

  for (const row of payload.exchangeRates) {
    const currency = row.key.toUpperCase();
    const unit = row.unit ?? 1;
    const rate = row.currentExchangeRate / unit;
    const asOf = fxAsOf(row.lastUpdate);
    const seriesCode = fxSeriesCode(currency);
    const seriesId = ensureSeries(db, seriesCode, `${currency}/ILS`, "ILS");
    if (
      insertObservation(db, seriesId, asOf, rate, BOI_FX_URL, sha, fetchedAt)
    ) {
      inserted += 1;
    }
    currencies.push(currency);
  }

  for (const currency of Object.keys(FX_SERIES_CODES)) {
    if (currencies.includes(currency)) {
      continue;
    }
    const fallbackRate = await fetchFrankfurterRate(currency, fetchFn);
    if (fallbackRate === null) {
      continue;
    }
    usedFallback = true;
    const asOf = new Date().toISOString().slice(0, 10);
    const seriesCode = fxSeriesCode(currency);
    const seriesId = ensureSeries(db, seriesCode, `${currency}/ILS`, "ILS");
    const fallbackUrl = `https://api.frankfurter.dev/latest?from=${currency}&to=ILS`;
    const fallbackSha = hashResponseBody(`${currency}:${fallbackRate}`);
    if (
      insertObservation(
        db,
        seriesId,
        asOf,
        fallbackRate,
        fallbackUrl,
        fallbackSha,
        fetchedAt,
      )
    ) {
      inserted += 1;
    }
    currencies.push(currency);
  }

  return { inserted, currencies, usedFallback };
}

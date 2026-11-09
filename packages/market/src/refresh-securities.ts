import { z } from "zod";
import { egressFetch } from "@moneytrack/egress";
import type { MarketFetch } from "./refresh-boi.js";

const YahooChartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string().optional(),
            regularMarketPrice: z.number().optional(),
            chartPreviousClose: z.number().optional(),
          }),
          timestamp: z.array(z.number()).optional(),
        }),
      )
      .optional(),
  }),
});

export type YahooTaseQuote = {
  symbol: string;
  price: number;
  currency: string;
  asOf: string;
  source: "yahoo_unofficial";
};

/**
 * Unofficial Yahoo Finance fallback for TASE symbols (e.g. TA35.TA).
 * TASE prices may arrive in agorot with currency ILA — divide by 100.
 * Not authoritative; prefer TASE DataHub when registered.
 */
export async function fetchYahooTaseQuote(
  symbol: string,
  fetchFn: MarketFetch = egressFetch,
): Promise<YahooTaseQuote | null> {
  const normalized = symbol.includes(".") ? symbol : `${symbol}.TA`;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}` +
    `?interval=1d&range=1d`;
  const response = await fetchFn(url, "ref_securities_yahoo_stub");
  if (!response.ok) {
    return null;
  }

  const raw = await response.text();
  const payload = YahooChartSchema.parse(JSON.parse(raw));
  const result = payload.chart.result?.[0];
  if (!result) {
    return null;
  }

  const rawPrice = result.meta.regularMarketPrice ?? result.meta.chartPreviousClose;
  if (rawPrice == null) {
    return null;
  }

  const currency = (result.meta.currency ?? "ILS").toUpperCase();
  const price = currency === "ILA" || currency === "ILS" ? rawPrice / 100 : rawPrice;
  const ts = result.timestamp?.at(-1);
  const asOf = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return {
    symbol: normalized,
    price,
    currency: currency === "ILA" ? "ILS" : currency,
    asOf,
    source: "yahoo_unofficial",
  };
}

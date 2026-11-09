import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDb,
  eq,
  initDb,
  referenceObservations,
  referenceSeries,
  runMigrations,
  type MoneyTrackDb,
} from "@moneytrack/db";
import boiInterest from "./fixtures/boi-interest.json" with { type: "json" };
import boiFx from "./fixtures/boi-fx.json" with { type: "json" };
import cpiFixture from "./fixtures/cpi.json" with { type: "json" };
import fundGemel from "./fixtures/fund-gemel.json" with { type: "json" };
import yahooTa35 from "./fixtures/yahoo-ta35.json" with { type: "json" };
import { computeEffectiveRate } from "./compute-effective-rate.js";
import { isEncryptedSqliteAvailable } from "@moneytrack/db";
import { PRIME_SPREAD } from "./config.js";
import type { MarketFetch } from "./refresh-boi.js";
import { refreshBoi } from "./refresh-boi.js";
import { hasFreshCpiForMonth, refreshCpi } from "./refresh-cpi.js";
import { refreshFx } from "./refresh-fx.js";
import { refreshFunds } from "./refresh-funds.js";
import { fetchYahooTaseQuote } from "./refresh-securities.js";
import {
  getLatestMarketRates,
  isCpiRetryWindow,
  resetSchedulerState,
  shouldRunDailyRefresh,
} from "./index.js";


// The global Response comes from @types/node's bundled undici-types, which lags
// the undici version egressFetch returns; the tests only read status and body.
function mockResponse(body: unknown, status = 200): Awaited<ReturnType<MarketFetch>> {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as Awaited<ReturnType<MarketFetch>>;
}

function createMockFetch(handlers: Record<string, unknown>): MarketFetch {
  return async (url: string) => {
    const parsed = new URL(url);
    const key = parsed.hostname + parsed.pathname;
    if (handlers[key]) {
      return mockResponse(handlers[key]);
    }
    if (url.includes("datastore_search") && url.includes("a30dcbea")) {
      return mockResponse(fundGemel);
    }
    if (url.includes("datastore_search") && url.includes("6d47d6b5")) {
      return mockResponse({ success: true, result: { total: 0, records: [] } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

async function openTestDb(): Promise<{ db: MoneyTrackDb; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-market-"));
  const key = randomBytes(32);
  closeDb();
  const db = await initDb({ dataDir: tmpDir, key, skipGuards: true });
  runMigrations();
  return {
    db,
    cleanup: () => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe("computeEffectiveRate", () => {
  const market = { prime: 5, cpi: 2.5 };

  it("returns fixed rate", () => {
    expect(computeEffectiveRate("fixed", null, 3.9, market)).toBe(3.9);
  });

  it("returns prime-linked rate", () => {
    expect(computeEffectiveRate("prime_linked", 0.5, null, market)).toBe(5.5);
    expect(computeEffectiveRate("prime_plus", 0.5, null, market)).toBe(5.5);
  });

  it("returns CPI-linked variable rate", () => {
    expect(computeEffectiveRate("cpi_linked_variable", 1.2, null, market)).toBe(3.7);
    expect(computeEffectiveRate("cpi_plus", 1.2, null, market)).toBe(3.7);
  });
});

describe("scheduler helpers", () => {
  afterEach(() => {
    resetSchedulerState();
  });

  it("flags CPI retry window around the 15th", () => {
    expect(isCpiRetryWindow(new Date("2026-08-15T10:00:00"))).toBe(true);
    expect(isCpiRetryWindow(new Date("2026-08-12T10:00:00"))).toBe(false);
  });

  it("runs daily refresh once per day", () => {
    expect(shouldRunDailyRefresh("2026-08-25")).toBe(true);
    resetSchedulerState();
  });
});

describe.skipIf(!isEncryptedSqliteAvailable())("reference refreshers", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    resetSchedulerState();
  });

  it("stores BOI and prime observations", async () => {
    const opened = await openTestDb();
    cleanup = opened.cleanup;
    const fetchFn = createMockFetch({
      "www.boi.org.il/PublicApi/GetInterest": boiInterest,
    });

    const result = await refreshBoi(opened.db, fetchFn);
    expect(result.boiRate).toBe(3.5);
    expect(result.prime).toBe(3.5 + PRIME_SPREAD);
    expect(result.inserted).toBe(2);

    const prime = opened.db
      .select()
      .from(referenceSeries)
      .where(eq(referenceSeries.seriesCode, "prime"))
      .get();
    expect(prime).toBeTruthy();
    const obs = opened.db
      .select()
      .from(referenceObservations)
      .where(eq(referenceObservations.seriesId, prime!.id))
      .all();
    expect(obs).toHaveLength(1);
    expect(obs[0]?.value).toBe(5);
  });

  it("stores CPI index and YoY observations", async () => {
    const opened = await openTestDb();
    cleanup = opened.cleanup;
    const fetchFn = createMockFetch({
      "api.cbs.gov.il/index/data/price": cpiFixture,
    });

    const result = await refreshCpi(opened.db, fetchFn);
    expect(result.latestIndex).toBe(105.1);
    expect(result.latestYoy).toBe(1.5);
    expect(result.inserted).toBeGreaterThan(0);
    expect(hasFreshCpiForMonth(opened.db, 2026, 7)).toBe(true);
  });

  it("stores FX rates with JPY unit normalization", async () => {
    const opened = await openTestDb();
    cleanup = opened.cleanup;
    const fetchFn = createMockFetch({
      "www.boi.org.il/PublicApi/GetExchangeRates": boiFx,
      // BOI does not publish CHF, so the Frankfurter fallback is used for it.
      "api.frankfurter.dev/latest": { rates: { ILS: 4.12 } },
    });

    const result = await refreshFx(opened.db, fetchFn);
    expect(result.currencies).toContain("USD");
    expect(result.currencies).toContain("CHF");
    expect(result.usedFallback).toBe(true);
    expect(result.inserted).toBeGreaterThan(0);

    const usdSeries = opened.db
      .select()
      .from(referenceSeries)
      .where(eq(referenceSeries.seriesCode, "fx_usd_ils"))
      .get();
    const usdObs = opened.db
      .select()
      .from(referenceObservations)
      .where(eq(referenceObservations.seriesId, usdSeries!.id))
      .all();
    expect(usdObs[0]?.value).toBe(3.65);

    const jpySeries = opened.db
      .select()
      .from(referenceSeries)
      .where(eq(referenceSeries.seriesCode, "fx_jpy_ils"))
      .get();
    const jpyObs = opened.db
      .select()
      .from(referenceObservations)
      .where(eq(referenceObservations.seriesId, jpySeries!.id))
      .all();
    expect(jpyObs[0]?.value).toBeCloseTo(0.0245, 4);
  });

  it("stores gemel fund net yields", async () => {
    const opened = await openTestDb();
    cleanup = opened.cleanup;
    const fetchFn = createMockFetch({});

    const result = await refreshFunds(opened.db, fetchFn);
    expect(result.gemelFunds).toBe(2);
    expect(result.inserted).toBe(2);

    const fundSeries = opened.db
      .select()
      .from(referenceSeries)
      .where(eq(referenceSeries.seriesCode, "fund_gemel_101"))
      .get();
    const fundObs = opened.db
      .select()
      .from(referenceObservations)
      .where(eq(referenceObservations.seriesId, fundSeries!.id))
      .all();
    expect(fundObs[0]?.value).toBeCloseTo(3.4, 5);
  });

  it("normalizes Yahoo TASE agorot prices", async () => {
    const fetchFn = createMockFetch({
      "query1.finance.yahoo.com/v8/finance/chart/TA35.TA": yahooTa35,
    });
    const quote = await fetchYahooTaseQuote("TA35", fetchFn);
    expect(quote?.price).toBeCloseTo(245.67, 2);
    expect(quote?.currency).toBe("ILS");
    expect(quote?.source).toBe("yahoo_unofficial");
  });

  it("exposes latest market rates for loan math", async () => {
    const opened = await openTestDb();
    cleanup = opened.cleanup;
    const fetchFn = createMockFetch({
      "www.boi.org.il/PublicApi/GetInterest": boiInterest,
      "api.cbs.gov.il/index/data/price": cpiFixture,
    });

    await refreshBoi(opened.db, fetchFn);
    await refreshCpi(opened.db, fetchFn);
    const rates = getLatestMarketRates(opened.db);
    expect(rates?.prime).toBe(5);
    expect(rates?.cpi).toBe(1.5);
    expect(computeEffectiveRate("prime_linked", 0.75, null, rates!)).toBe(5.75);
  });
});

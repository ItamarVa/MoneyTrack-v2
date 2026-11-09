import { z } from "zod";
import type { MoneyTrackDb } from "@moneytrack/db";
import { egressFetch } from "@moneytrack/egress";
import { GEMEL_FUND_RESOURCE_ID, PENSIA_FUND_RESOURCE_ID } from "./config.js";
import { ensureSeries, hashResponseBody, insertObservation } from "./series-store.js";
import type { MarketFetch } from "./refresh-boi.js";

const FundRecordSchema = z.object({
  FUND_ID: z.number(),
  REPORT_PERIOD: z.number(),
  AVG_ANNUAL_YIELD_TRAILING_3YRS: z.number().optional(),
  AVG_ANNUAL_MANAGEMENT_FEE: z.number().optional(),
});

const DatastoreSearchSchema = z.object({
  success: z.boolean(),
  result: z.object({
    total: z.number(),
    records: z.array(FundRecordSchema),
  }),
});

type FundKind = "gemel" | "pensia";

function fundSeriesCode(kind: FundKind, fundId: number): string {
  return `fund_${kind}_${fundId}`;
}

function reportPeriodAsOf(reportPeriod: number): string {
  const year = Math.floor(reportPeriod / 100);
  const month = reportPeriod % 100;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function netYield(record: z.infer<typeof FundRecordSchema>): number | null {
  if (record.AVG_ANNUAL_YIELD_TRAILING_3YRS == null) {
    return null;
  }
  const fee = record.AVG_ANNUAL_MANAGEMENT_FEE ?? 0;
  return record.AVG_ANNUAL_YIELD_TRAILING_3YRS - fee;
}

async function fetchResourceRecords(
  resourceId: string,
  fetchFn: MarketFetch,
  purpose: string,
): Promise<z.infer<typeof FundRecordSchema>[]> {
  const records: z.infer<typeof FundRecordSchema>[] = [];
  const limit = 1000;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const url =
      `https://data.gov.il/api/3/action/datastore_search` +
      `?resource_id=${resourceId}&limit=${limit}&offset=${offset}`;
    const response = await fetchFn(url, purpose);
    if (!response.ok) {
      throw new Error(`data.gov.il search failed: HTTP ${response.status}`);
    }
    const raw = await response.text();
    const payload = DatastoreSearchSchema.parse(JSON.parse(raw));
    if (!payload.success) {
      throw new Error("data.gov.il search returned success=false");
    }
    total = payload.result.total;
    records.push(...payload.result.records);
    offset += limit;
    if (payload.result.records.length === 0) {
      break;
    }
  }

  return records;
}

function latestRecordsByFund(
  records: z.infer<typeof FundRecordSchema>[],
): Map<number, z.infer<typeof FundRecordSchema>> {
  const byFund = new Map<number, z.infer<typeof FundRecordSchema>>();
  for (const record of records) {
    const existing = byFund.get(record.FUND_ID);
    if (!existing || record.REPORT_PERIOD > existing.REPORT_PERIOD) {
      byFund.set(record.FUND_ID, record);
    }
  }
  return byFund;
}

async function refreshFundKind(
  db: MoneyTrackDb,
  kind: FundKind,
  resourceId: string,
  fetchFn: MarketFetch,
  rawSha: string,
  fetchedAt: string,
): Promise<number> {
  const sourceUrl = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}`;
  const records = await fetchResourceRecords(
    resourceId,
    fetchFn,
    `ref_fund_${kind}`,
  );
  const latest = latestRecordsByFund(records);
  let inserted = 0;

  for (const record of latest.values()) {
    const yieldValue = netYield(record);
    if (yieldValue === null) {
      continue;
    }
    const seriesCode = fundSeriesCode(kind, record.FUND_ID);
    const seriesId = ensureSeries(
      db,
      seriesCode,
      `${kind} fund ${record.FUND_ID}`,
      "%",
    );
    const asOf = reportPeriodAsOf(record.REPORT_PERIOD);
    if (
      insertObservation(db, seriesId, asOf, yieldValue, sourceUrl, rawSha, fetchedAt)
    ) {
      inserted += 1;
    }
  }

  return inserted;
}

export type RefreshFundsResult = {
  inserted: number;
  gemelFunds: number;
  pensiaFunds: number;
};

export async function refreshFunds(
  db: MoneyTrackDb,
  fetchFn: MarketFetch = egressFetch,
): Promise<RefreshFundsResult> {
  const fetchedAt = new Date().toISOString();
  const rawSha = hashResponseBody(`${fetchedAt}:funds`);

  const gemelInserted = await refreshFundKind(
    db,
    "gemel",
    GEMEL_FUND_RESOURCE_ID,
    fetchFn,
    rawSha,
    fetchedAt,
  );
  const pensiaInserted = await refreshFundKind(
    db,
    "pensia",
    PENSIA_FUND_RESOURCE_ID,
    fetchFn,
    rawSha,
    fetchedAt,
  );

  return {
    inserted: gemelInserted + pensiaInserted,
    gemelFunds: gemelInserted,
    pensiaFunds: pensiaInserted,
  };
}

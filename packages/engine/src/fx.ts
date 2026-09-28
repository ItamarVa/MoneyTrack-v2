import { randomUUID } from "node:crypto";
import {
  eq,
  rawTransactions,
  referenceObservations,
  referenceSeries,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { egressFetch } from "@moneytrack/egress";

type RateLookup = (currency: string, asOf: string) => Promise<number | null>;

function seriesCodeForCurrency(currency: string): string | null {
  const code = currency.toUpperCase();
  if (code === "ILS") {
    return null;
  }
  return `fx_${code.toLowerCase()}_ils`;
}

export function lookupStoredFxRate(
  db: MoneyTrackDb,
  currency: string,
  asOf: string,
): number | null {
  const code = seriesCodeForCurrency(currency);
  if (!code) {
    return null;
  }

  const series = db.select().from(referenceSeries).where(eq(referenceSeries.seriesCode, code)).get();
  if (!series) {
    return null;
  }

  const observations = db
    .select()
    .from(referenceObservations)
    .where(eq(referenceObservations.seriesId, series.id))
    .all()
    .filter((row) => row.asOf <= asOf)
    .sort((a, b) => b.asOf.localeCompare(a.asOf));

  return observations[0]?.value ?? null;
}

/** ponytail: BOI live fetch stub — tests inject lookup; production uses reference_series first. */
export async function fetchBoiRepresentativeRate(
  currency: string,
  _asOf: string,
): Promise<number | null> {
  const url = "https://www.boi.org.il/PublicApi/GetExchangeRates";
  const response = await egressFetch(url, "fx_boi_representative");
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    exchangeRates?: Array<{ key: string; currentExchangeRate: number; unit?: number }>;
  };

  const target = currency.toUpperCase();
  const row = payload.exchangeRates?.find((entry) => entry.key === target);
  if (!row) {
    return null;
  }

  const unit = row.unit ?? 1;
  return row.currentExchangeRate / unit;
}

export async function resolveFxRate(
  db: MoneyTrackDb,
  currency: string,
  asOf: string,
  lookup?: RateLookup,
): Promise<number | null> {
  if (currency.toUpperCase() === "ILS") {
    return 1;
  }

  const stored = lookupStoredFxRate(db, currency, asOf);
  if (stored !== null) {
    return stored;
  }

  if (lookup) {
    return lookup(currency, asOf);
  }

  try {
    return await fetchBoiRepresentativeRate(currency, asOf);
  } catch {
    return null;
  }
}

export async function applyFxToTransaction(
  db: MoneyTrackDb,
  txn: typeof transactions.$inferSelect,
  lookup?: RateLookup,
): Promise<boolean> {
  if (txn.originalCurrency.toUpperCase() === "ILS") {
    return false;
  }

  const rate = await resolveFxRate(db, txn.originalCurrency, txn.transactionDate, lookup);
  if (rate === null) {
    return false;
  }

  const converted = Math.abs(txn.originalAmount) * rate;
  const amountIls = txn.amountIls === 0 ? converted : txn.amountIls;
  const fxFeeIls = txn.amountIls === 0 ? 0 : Math.max(0, txn.amountIls - converted);
  db.update(transactions)
    .set({
      fxRate: rate,
      fxFeeIls,
      amountIls,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(transactions.id, txn.id))
    .run();
  return true;
}

export async function applyFxForRun(
  db: MoneyTrackDb,
  runId: string,
  lookup?: RateLookup,
): Promise<number> {
  const runRawIds = new Set(
    db
      .select()
      .from(rawTransactions)
      .where(eq(rawTransactions.runId, runId))
      .all()
      .map((row) => row.id),
  );

  const runTxns = db
    .select()
    .from(transactions)
    .all()
    .filter((row) => row.firstSeenRawId && runRawIds.has(row.firstSeenRawId));

  let updated = 0;
  for (const txn of runTxns) {
    if (txn.originalCurrency.toUpperCase() === "ILS") {
      continue;
    }
    const changed = await applyFxToTransaction(db, txn, lookup);
    if (changed) {
      updated += 1;
    }
  }

  return updated;
}

export function seedFxObservation(
  db: MoneyTrackDb,
  currency: string,
  asOf: string,
  rate: number,
): void {
  const code = seriesCodeForCurrency(currency);
  if (!code) {
    throw new Error(`Unsupported FX currency: ${currency}`);
  }

  let series = db.select().from(referenceSeries).where(eq(referenceSeries.seriesCode, code)).get();
  if (!series) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(referenceSeries)
      .values({
        id,
        seriesCode: code,
        displayName: `${currency}/ILS`,
        unit: "ILS",
        createdAt: now,
      })
      .run();
    series = { id, seriesCode: code, displayName: `${currency}/ILS`, unit: "ILS", createdAt: now };
  }

  db.insert(referenceObservations)
    .values({
      id: randomUUID(),
      seriesId: series.id,
      asOf,
      value: rate,
      sourceUrl: "https://www.boi.org.il/PublicApi/GetExchangeRates",
      fetchedAt: new Date().toISOString(),
      rawResponseSha256: randomUUID().replace(/-/g, ""),
    })
    .run();
}

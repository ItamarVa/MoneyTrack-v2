import { createHash, randomUUID } from "node:crypto";
import {
  and,
  eq,
  referenceObservations,
  referenceSeries,
  type MoneyTrackDb,
} from "@moneytrack/db";

export function hashResponseBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function ensureSeries(
  db: MoneyTrackDb,
  seriesCode: string,
  displayName: string,
  unit: string,
): string {
  const existing = db
    .select()
    .from(referenceSeries)
    .where(eq(referenceSeries.seriesCode, seriesCode))
    .get();
  if (existing) {
    return existing.id;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(referenceSeries)
    .values({
      id,
      seriesCode,
      displayName,
      unit,
      createdAt: now,
    })
    .run();
  return id;
}

export function insertObservation(
  db: MoneyTrackDb,
  seriesId: string,
  asOf: string,
  value: number,
  sourceUrl: string,
  rawResponseSha256: string,
  fetchedAt?: string,
): boolean {
  const existing = db
    .select()
    .from(referenceObservations)
    .where(
      and(
        eq(referenceObservations.seriesId, seriesId),
        eq(referenceObservations.asOf, asOf),
      ),
    )
    .all()
    .find(
      (row) =>
        row.value === value && row.rawResponseSha256 === rawResponseSha256,
    );

  if (existing) {
    return false;
  }

  db.insert(referenceObservations)
    .values({
      id: randomUUID(),
      seriesId,
      asOf,
      value,
      sourceUrl,
      fetchedAt: fetchedAt ?? new Date().toISOString(),
      rawResponseSha256,
    })
    .run();
  return true;
}

export function latestObservation(
  db: MoneyTrackDb,
  seriesCode: string,
): { asOf: string; value: number } | null {
  const series = db
    .select()
    .from(referenceSeries)
    .where(eq(referenceSeries.seriesCode, seriesCode))
    .get();
  if (!series) {
    return null;
  }

  const rows = db
    .select()
    .from(referenceObservations)
    .where(eq(referenceObservations.seriesId, series.id))
    .all()
    .sort((a, b) => b.asOf.localeCompare(a.asOf));

  const latest = rows[0];
  if (!latest) {
    return null;
  }
  return { asOf: latest.asOf, value: latest.value };
}

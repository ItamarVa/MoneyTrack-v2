import { randomUUID } from "node:crypto";
import {
  eq,
  loanScheduleRows,
  loanTracks,
  loans,
  referenceObservations,
  referenceSeries,
  type MoneyTrackDb,
} from "@moneytrack/db";
import type { CpiConvention, LoanTrack, RateType } from "@moneytrack/contracts";
import {
  type AssumptionInputs,
  type ScheduleResult,
  type TrackInput,
  buildAssumptionSetId,
  compareEarlyRepayment,
  computeSchedule,
  roundToAgora,
} from "./amortization.js";
import { nowIso } from "./dates.js";

const PRIME_SERIES = "prime";
const CPI_SERIES = "cpi_general";

export function loadAssumptionInputs(db: MoneyTrackDb): AssumptionInputs {
  const primeSeries = db
    .select()
    .from(referenceSeries)
    .where(eq(referenceSeries.seriesCode, PRIME_SERIES))
    .get();
  const cpiSeries = db
    .select()
    .from(referenceSeries)
    .where(eq(referenceSeries.seriesCode, CPI_SERIES))
    .get();

  const primeObservations = primeSeries
    ? db
        .select()
        .from(referenceObservations)
        .where(eq(referenceObservations.seriesId, primeSeries.id))
        .all()
        .map((row) => ({ asOf: row.asOf, value: row.value }))
    : [];

  const cpiObservations = cpiSeries
    ? db
        .select()
        .from(referenceObservations)
        .where(eq(referenceObservations.seriesId, cpiSeries.id))
        .all()
        .map((row) => ({ asOf: row.asOf, value: row.value }))
    : [];

  return { primeObservations, cpiObservations };
}

export function seedReferenceObservation(
  db: MoneyTrackDb,
  seriesCode: string,
  asOf: string,
  value: number,
): void {
  let series = db
    .select()
    .from(referenceSeries)
    .where(eq(referenceSeries.seriesCode, seriesCode))
    .get();

  if (!series) {
    const id = randomUUID();
    const now = nowIso();
    db.insert(referenceSeries)
      .values({
        id,
        seriesCode,
        displayName: seriesCode,
        unit: seriesCode === CPI_SERIES ? "index" : "percent",
        createdAt: now,
      })
      .run();
    series = { id, seriesCode, displayName: seriesCode, unit: "index", createdAt: now };
  }

  db.insert(referenceObservations)
    .values({
      id: randomUUID(),
      seriesId: series.id,
      asOf,
      value,
      sourceUrl: "https://test.local",
      fetchedAt: nowIso(),
      rawResponseSha256: randomUUID().replace(/-/g, ""),
    })
    .run();
}

function trackInputFromRow(
  track: typeof loanTracks.$inferSelect,
  originationDate: string,
): TrackInput {
  return {
    rateType: track.rateType as RateType,
    margin: track.margin,
    fixedRate: track.fixedRate,
    termMonths: track.termMonths,
    principal: track.principal,
    amortizationMethod: track.amortizationMethod as TrackInput["amortizationMethod"],
    cpiBaseIndexValue: track.cpiBaseIndexValue,
    cpiConvention: track.cpiConvention as CpiConvention | null,
    rateResetMonths: track.rateResetMonths,
    originationDate,
  };
}

export function currentAssumptionSetId(db: MoneyTrackDb): string {
  return buildAssumptionSetId(loadAssumptionInputs(db));
}

export function persistScheduleRows(
  db: MoneyTrackDb,
  trackId: string,
  result: ScheduleResult,
): void {
  const computedAt = nowIso();
  for (const row of result.rows) {
    db.insert(loanScheduleRows)
      .values({
        id: randomUUID(),
        trackId,
        periodIndex: row.periodIndex,
        dueDate: row.dueDate,
        principalPart: row.principalPart,
        interestPart: row.interestPart,
        cpiAdjustment: row.cpiAdjustment,
        remainingPrincipal: row.remainingPrincipal,
        computedAt,
        assumptionSetId: result.assumptionSetId,
      })
      .run();
  }
}

export function recomputeTrackSchedule(db: MoneyTrackDb, trackId: string): ScheduleResult {
  const track = db.select().from(loanTracks).where(eq(loanTracks.id, trackId)).get();
  if (!track) {
    throw new Error(`Track not found: ${trackId}`);
  }

  const loan = db.select().from(loans).where(eq(loans.id, track.loanId)).get();
  if (!loan) {
    throw new Error(`Loan not found: ${track.loanId}`);
  }

  const assumptions = loadAssumptionInputs(db);
  const input = trackInputFromRow(track, loan.originationDate);
  const result = computeSchedule(input, assumptions);
  persistScheduleRows(db, trackId, result);
  return result;
}

export function recomputeLoanSchedules(db: MoneyTrackDb, loanId: string): number {
  const tracks = db.select().from(loanTracks).where(eq(loanTracks.loanId, loanId)).all();
  for (const track of tracks) {
    recomputeTrackSchedule(db, track.id);
  }
  return tracks.length;
}

export function recomputeAllSchedules(db: MoneyTrackDb): number {
  const tracks = db.select().from(loanTracks).all();
  for (const track of tracks) {
    recomputeTrackSchedule(db, track.id);
  }
  return tracks.length;
}

export function getScheduleForTrack(
  db: MoneyTrackDb,
  trackId: string,
  assumptionSetId?: string,
): ScheduleResult | null {
  const rows = db
    .select()
    .from(loanScheduleRows)
    .where(eq(loanScheduleRows.trackId, trackId))
    .all();

  if (rows.length === 0) {
    return null;
  }

  const targetSetId =
    assumptionSetId ??
    rows.sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0]?.assumptionSetId;

  const filtered = rows
    .filter((row) => row.assumptionSetId === targetSetId)
    .sort((a, b) => a.periodIndex - b.periodIndex);

  if (filtered.length === 0) {
    return null;
  }

  let totalInterest = 0;
  let totalPrincipal = 0;
  const scheduleRows = filtered.map((row) => {
    totalInterest = roundToAgora(totalInterest + row.interestPart);
    totalPrincipal = roundToAgora(totalPrincipal + row.principalPart);
    return {
      periodIndex: row.periodIndex,
      dueDate: row.dueDate,
      principalPart: row.principalPart,
      interestPart: row.interestPart,
      cpiAdjustment: row.cpiAdjustment,
      remainingPrincipal: row.remainingPrincipal,
      totalPayment: roundToAgora(row.principalPart + row.interestPart),
    };
  });

  return {
    rows: scheduleRows,
    assumptionSetId: targetSetId!,
    totalInterest,
    totalPrincipal,
  };
}

export function remainingPrincipalAt(
  db: MoneyTrackDb,
  trackId: string,
  asOf: string,
): number {
  const schedule = getScheduleForTrack(db, trackId);
  if (!schedule) {
    const track = db.select().from(loanTracks).where(eq(loanTracks.id, trackId)).get();
    return track ? roundToAgora(track.principal) : 0;
  }

  let remaining = schedule.rows[0]?.remainingPrincipal ?? 0;
  for (const row of schedule.rows) {
    if (row.dueDate <= asOf) {
      remaining = row.remainingPrincipal;
    }
  }
  return roundToAgora(remaining);
}

export function totalLoanLiabilitiesAt(db: MoneyTrackDb, asOf: string): number {
  const tracks = db.select().from(loanTracks).all();
  let total = 0;
  for (const track of tracks) {
    total += remainingPrincipalAt(db, track.id, asOf);
  }
  return roundToAgora(total);
}

export function computeEarlyRepaymentForLoan(
  db: MoneyTrackDb,
  loanId: string,
  extraPayment: number,
): {
  interestSaved: number;
  monthsSaved: number;
  tracks: Array<{
    trackId: string;
    baselineInterest: number;
    scenarioInterest: number;
    interestSaved: number;
    monthsSaved: number;
  }>;
} {
  const loan = db.select().from(loans).where(eq(loans.id, loanId)).get();
  if (!loan) {
    throw new Error(`Loan not found: ${loanId}`);
  }

  const tracks = db.select().from(loanTracks).where(eq(loanTracks.loanId, loanId)).all();
  const assumptions = loadAssumptionInputs(db);
  const totalPrincipal = tracks.reduce((sum, track) => sum + track.principal, 0);

  let totalInterestSaved = 0;
  let totalMonthsSaved = 0;
  const trackResults: Array<{
    trackId: string;
    baselineInterest: number;
    scenarioInterest: number;
    interestSaved: number;
    monthsSaved: number;
  }> = [];

  for (const track of tracks) {
    const share = totalPrincipal > 0 ? track.principal / totalPrincipal : 0;
    const trackExtra = roundToAgora(extraPayment * share);
    const input = trackInputFromRow(track, loan.originationDate);
    const comparison = compareEarlyRepayment(input, assumptions, trackExtra);
    trackResults.push({
      trackId: track.id,
      baselineInterest: comparison.baseline.totalInterest,
      scenarioInterest: comparison.scenario.totalInterest,
      interestSaved: comparison.interestSaved,
      monthsSaved: comparison.monthsSaved,
    });
    totalInterestSaved = roundToAgora(totalInterestSaved + comparison.interestSaved);
    totalMonthsSaved += comparison.monthsSaved;
  }

  return {
    interestSaved: totalInterestSaved,
    monthsSaved: totalMonthsSaved,
    tracks: trackResults,
  };
}

export function mapLoanTrackToInput(
  track: LoanTrack,
  originationDate: string,
): TrackInput {
  return {
    rateType: track.rateType,
    margin: track.margin,
    fixedRate: track.fixedRate,
    termMonths: track.termMonths,
    principal: track.principal,
    amortizationMethod: track.amortizationMethod,
    cpiBaseIndexValue: track.cpiBaseIndexValue,
    cpiConvention: track.cpiConvention,
    rateResetMonths: track.rateResetMonths,
    originationDate,
  };
}

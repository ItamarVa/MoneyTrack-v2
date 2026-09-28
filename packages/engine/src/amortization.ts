import { createHash } from "node:crypto";
import type {
  AmortizationMethod,
  CpiConvention,
  RateType,
} from "@moneytrack/contracts";
import { shiftMonths } from "./dates.js";

/** Half-up rounding to Israeli agora (0.01 ILS). */
export function roundToAgora(amount: number): number {
  return Number(Math.round(Number(`${amount}e2`)) + "e-2");
}

export type RateObservation = { asOf: string; value: number };
export type CpiObservation = { asOf: string; value: number };

export type AssumptionInputs = {
  primeObservations: RateObservation[];
  cpiObservations: CpiObservation[];
};

export type TrackInput = {
  rateType: RateType;
  margin: number | null;
  fixedRate: number | null;
  termMonths: number;
  principal: number;
  amortizationMethod: AmortizationMethod;
  cpiBaseIndexValue: number | null;
  cpiConvention: CpiConvention | null;
  rateResetMonths: number | null;
  originationDate: string;
};

export type ScheduleRow = {
  periodIndex: number;
  dueDate: string;
  principalPart: number;
  interestPart: number;
  cpiAdjustment: number;
  remainingPrincipal: number;
  totalPayment: number;
};

export type ScheduleResult = {
  rows: ScheduleRow[];
  assumptionSetId: string;
  totalInterest: number;
  totalPrincipal: number;
};

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function sortedObservations<T extends { asOf: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.asOf.localeCompare(b.asOf));
}

export function buildAssumptionSetId(assumptions: AssumptionInputs): string {
  const payload = JSON.stringify({
    prime: sortedObservations(assumptions.primeObservations),
    cpi: sortedObservations(assumptions.cpiObservations),
    v: 1,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function latestValueOnOrBefore(
  observations: RateObservation[],
  asOf: string,
): number | null {
  const sorted = sortedObservations(observations);
  let value: number | null = null;
  for (const row of sorted) {
    if (row.asOf <= asOf) {
      value = row.value;
    }
  }
  return value;
}

function cpiForMonth(
  observations: CpiObservation[],
  dueDate: string,
  convention: CpiConvention,
): number | null {
  const month = monthKey(dueDate);
  const targetMonth =
    convention === "known" ? monthKey(shiftMonths(`${month}-01`, -1)) : month;

  const matches = observations.filter((row) => monthKey(row.asOf) === targetMonth);
  if (matches.length === 0) {
    return latestValueOnOrBefore(observations, dueDate);
  }
  return matches.sort((a, b) => b.asOf.localeCompare(a.asOf))[0]?.value ?? null;
}

function annualRateForPeriod(
  track: TrackInput,
  assumptions: AssumptionInputs,
  dueDate: string,
  periodIndex: number,
): number {
  const margin = track.margin ?? 0;

  if (track.rateType === "fixed") {
    return track.fixedRate ?? 0;
  }

  if (track.rateType === "cpi_linked_fixed") {
    return track.fixedRate ?? 0;
  }

  const prime = latestValueOnOrBefore(assumptions.primeObservations, dueDate);
  if (prime === null) {
    throw new Error(`Missing prime observation for ${dueDate}`);
  }

  if (track.rateType === "prime_linked" || track.rateType === "cpi_linked_variable") {
    const resetMonths = track.rateResetMonths;
    if (resetMonths && resetMonths > 0) {
      const resetIndex = Math.floor(periodIndex / resetMonths) * resetMonths;
      const resetDate = shiftMonths(track.originationDate, resetIndex + 1);
      const resetPrime = latestValueOnOrBefore(assumptions.primeObservations, resetDate);
      if (resetPrime === null) {
        throw new Error(`Missing prime observation for reset ${resetDate}`);
      }
      return resetPrime + margin;
    }
    return prime + margin;
  }

  return track.fixedRate ?? 0;
}

function monthlyRate(annualPercent: number): number {
  return annualPercent / 12 / 100;
}

function shpitzerPayment(principal: number, monthlyR: number, remainingMonths: number): number {
  if (remainingMonths <= 0) {
    return roundToAgora(principal);
  }
  if (monthlyR === 0) {
    return roundToAgora(principal / remainingMonths);
  }
  const factor = (1 + monthlyR) ** remainingMonths;
  return roundToAgora((principal * monthlyR * factor) / (factor - 1));
}

function applyCpiAdjustment(
  principal: number,
  track: TrackInput,
  assumptions: AssumptionInputs,
  dueDate: string,
): { adjustedPrincipal: number; cpiAdjustment: number } {
  if (
    !track.rateType.startsWith("cpi_linked") ||
    track.cpiBaseIndexValue === null ||
    !track.cpiConvention
  ) {
    return { adjustedPrincipal: principal, cpiAdjustment: 0 };
  }

  const currentIndex = cpiForMonth(assumptions.cpiObservations, dueDate, track.cpiConvention);
  if (currentIndex === null) {
    throw new Error(`Missing CPI observation for ${dueDate}`);
  }

  const ratio = currentIndex / track.cpiBaseIndexValue;
  const adjustedPrincipal = roundToAgora(principal * ratio);
  const cpiAdjustment = roundToAgora(adjustedPrincipal - principal);
  return { adjustedPrincipal, cpiAdjustment };
}

function computePeriodParts(
  track: TrackInput,
  assumptions: AssumptionInputs,
  periodIndex: number,
  dueDate: string,
  principalBefore: number,
  remainingMonths: number,
): Pick<ScheduleRow, "principalPart" | "interestPart" | "cpiAdjustment" | "remainingPrincipal" | "totalPayment"> {
  const { adjustedPrincipal, cpiAdjustment } = applyCpiAdjustment(
    principalBefore,
    track,
    assumptions,
    dueDate,
  );

  const annualRate = annualRateForPeriod(track, assumptions, dueDate, periodIndex);
  const monthlyR = monthlyRate(annualRate);
  const interestPart = roundToAgora(adjustedPrincipal * monthlyR);

  let principalPart = 0;
  let totalPayment = 0;

  if (track.amortizationMethod === "equal_principal") {
    principalPart = roundToAgora(track.principal / track.termMonths);
    if (principalPart > adjustedPrincipal) {
      principalPart = roundToAgora(adjustedPrincipal);
    }
    totalPayment = roundToAgora(principalPart + interestPart);
  } else if (track.amortizationMethod === "grace") {
    principalPart = 0;
    totalPayment = interestPart;
  } else if (track.amortizationMethod === "balloon") {
    principalPart = periodIndex === track.termMonths - 1 ? roundToAgora(adjustedPrincipal) : 0;
    totalPayment = roundToAgora(principalPart + interestPart);
  } else {
    totalPayment = shpitzerPayment(adjustedPrincipal, monthlyR, remainingMonths);
    principalPart = roundToAgora(totalPayment - interestPart);
    if (principalPart < 0) {
      principalPart = 0;
      totalPayment = interestPart;
    }
    if (principalPart > adjustedPrincipal) {
      principalPart = roundToAgora(adjustedPrincipal);
      totalPayment = roundToAgora(principalPart + interestPart);
    }
  }

  const remainingPrincipal = roundToAgora(adjustedPrincipal - principalPart);

  return {
    principalPart,
    interestPart,
    cpiAdjustment,
    remainingPrincipal,
    totalPayment,
  };
}

export function computeSchedule(
  track: TrackInput,
  assumptions: AssumptionInputs,
  extraPrincipalReduction = 0,
): ScheduleResult {
  const assumptionSetId = buildAssumptionSetId(assumptions);
  const rows: ScheduleRow[] = [];
  let principalBefore = roundToAgora(track.principal - extraPrincipalReduction);
  if (principalBefore < 0) {
    principalBefore = 0;
  }

  let totalInterest = 0;
  let totalPrincipal = 0;

  for (let periodIndex = 0; periodIndex < track.termMonths; periodIndex += 1) {
    const dueDate = shiftMonths(track.originationDate, periodIndex + 1);
    const remainingMonths = track.termMonths - periodIndex;

    if (principalBefore <= 0) {
      break;
    }

    const parts = computePeriodParts(
      track,
      assumptions,
      periodIndex,
      dueDate,
      principalBefore,
      remainingMonths,
    );

    rows.push({
      periodIndex,
      dueDate,
      principalPart: parts.principalPart,
      interestPart: parts.interestPart,
      cpiAdjustment: parts.cpiAdjustment,
      remainingPrincipal: parts.remainingPrincipal,
      totalPayment: parts.totalPayment,
    });

    totalInterest = roundToAgora(totalInterest + parts.interestPart);
    totalPrincipal = roundToAgora(totalPrincipal + parts.principalPart);
    principalBefore = parts.remainingPrincipal;
  }

  return {
    rows,
    assumptionSetId,
    totalInterest,
    totalPrincipal,
  };
}

export function compareEarlyRepayment(
  track: TrackInput,
  assumptions: AssumptionInputs,
  extraPayment: number,
): {
  baseline: ScheduleResult;
  scenario: ScheduleResult;
  interestSaved: number;
  monthsSaved: number;
} {
  const baseline = computeSchedule(track, assumptions, 0);
  const scenario = computeSchedule(track, assumptions, extraPayment);
  const interestSaved = roundToAgora(baseline.totalInterest - scenario.totalInterest);
  const monthsSaved = baseline.rows.length - scenario.rows.length;
  return { baseline, scenario, interestSaved, monthsSaved };
}

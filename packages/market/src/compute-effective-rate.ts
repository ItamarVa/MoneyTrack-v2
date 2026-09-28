import type { RateType } from "@moneytrack/contracts";

export type EffectiveRateInput = {
  prime: number;
  /** Year-over-year CPI inflation percent for variable CPI-linked tracks. */
  cpi: number;
};

export type LoanRateModel = RateType | "prime_plus" | "cpi_plus";

export function computeEffectiveRate(
  rateModel: LoanRateModel,
  margin: number | null | undefined,
  fixedRate: number | null | undefined,
  market: EffectiveRateInput,
): number | null {
  switch (rateModel) {
    case "fixed":
    case "cpi_linked_fixed":
      return fixedRate ?? null;
    case "prime_linked":
    case "prime_plus":
      return market.prime + (margin ?? 0);
    case "cpi_linked_variable":
    case "cpi_plus":
      return market.cpi + (margin ?? 0);
    default:
      return null;
  }
}

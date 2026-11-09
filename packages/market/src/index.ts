import type { MoneyTrackDb } from "@moneytrack/db";
import { latestObservation } from "./series-store.js";
import type { EffectiveRateInput } from "./compute-effective-rate.js";

export * from "./config.js";
export * from "./series-store.js";
export * from "./compute-effective-rate.js";
export * from "./refresh-boi.js";
export * from "./refresh-cpi.js";
export * from "./refresh-fx.js";
export * from "./refresh-funds.js";
export * from "./refresh-securities.js";
export * from "./scheduler.js";

export function getLatestMarketRates(db: MoneyTrackDb): EffectiveRateInput | null {
  const prime = latestObservation(db, "prime");
  const cpi = latestObservation(db, "cpi_yoy");
  if (!prime || !cpi) {
    return null;
  }
  return { prime: prime.value, cpi: cpi.value };
}

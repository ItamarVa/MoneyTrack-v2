import type { MoneyTrackDb } from "@moneytrack/db";
import { detectAnomalies, detectDuplicates } from "./anomalies.js";
import { detectBudgetVariance } from "./budgets.js";
import { detectSubscriptions } from "./subscriptions.js";

export type IntelligenceResult = {
  budgetAlerts: number;
  subscriptionsDetected: number;
  anomalyAlerts: number;
  duplicateAlerts: number;
};

export function runIntelligenceDetectors(db: MoneyTrackDb): IntelligenceResult {
  return {
    budgetAlerts: detectBudgetVariance(db),
    subscriptionsDetected: detectSubscriptions(db),
    anomalyAlerts: detectAnomalies(db),
    duplicateAlerts: detectDuplicates(db),
  };
}

export * from "./alert-store.js";
export * from "./anomalies.js";
export * from "./budgets.js";
export * from "./category-insights.js";
export * from "./forecast.js";
export * from "./stats.js";
export * from "./subscriptions.js";

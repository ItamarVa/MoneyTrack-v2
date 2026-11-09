/**
 * Clears detector output that the current eligibility rules (eligible-transactions.ts) no longer
 * allow. Alerts and recurring instruments persist across syncs, so noise raised under older rules
 * (fund purchases, mortgage, tax deductions, business accounts) would otherwise stay in the inbox
 * and in the cash-flow forecast forever. Price-increase and anomaly alerts are also re-checked
 * against the current thresholds (subscription recurrence, card-only, 2x median), so noise from
 * looser earlier rules is dismissed even though its transaction is still eligible.
 * Runs first in runIntelligenceDetectors; idempotent.
 */
import { alerts, eq, recurringInstruments, type MoneyTrackDb } from "@moneytrack/db";
import { buildAnomalyQualifier } from "./anomalies.js";
import { loadDetectableTransactions } from "./eligible-transactions.js";
import { buildPriceIncreaseQualifier } from "./subscriptions.js";

const TRANSACTION_ALERT_TYPES = new Set(["price_increase", "anomaly", "duplicate"]);

export function resolveStaleDetections(db: MoneyTrackDb): { alerts: number; instruments: number } {
  const eligible = loadDetectableTransactions(db);
  const eligibleIds = new Set(eligible.map((row) => row.id));
  const priceIncreaseStillQualifies = buildPriceIncreaseQualifier(db);
  const anomalyStillQualifies = buildAnomalyQualifier(db);
  const eligibleSeries = new Set(eligible.map((row) => `${row.merchantId}|${row.accountId}`));

  const stillQualifies = (type: string, transactionId: string): boolean =>
    type === "price_increase"
      ? priceIncreaseStillQualifies(transactionId)
      : type === "anomaly"
        ? anomalyStillQualifies(transactionId)
        : true;

  let dismissedAlerts = 0;
  for (const alert of db.select().from(alerts).all()) {
    if (
      alert.status === "dismissed" ||
      !TRANSACTION_ALERT_TYPES.has(alert.type) ||
      !alert.transactionId ||
      (eligibleIds.has(alert.transactionId) && stillQualifies(alert.type, alert.transactionId))
    ) {
      continue;
    }
    db.update(alerts).set({ status: "dismissed" }).where(eq(alerts.id, alert.id)).run();
    dismissedAlerts += 1;
  }

  let endedInstruments = 0;
  for (const instrument of db.select().from(recurringInstruments).all()) {
    if (
      instrument.status !== "active" ||
      eligibleSeries.has(`${instrument.merchantId}|${instrument.accountId}`)
    ) {
      continue;
    }
    db.update(recurringInstruments)
      .set({ status: "ended" })
      .where(eq(recurringInstruments.id, instrument.id))
      .run();
    endedInstruments += 1;
  }

  return { alerts: dismissedAlerts, instruments: endedInstruments };
}

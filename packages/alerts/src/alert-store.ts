import { randomUUID } from "node:crypto";
import { alerts, type MoneyTrackDb } from "@moneytrack/db";
import type { AlertSeverity, AlertType } from "@moneytrack/contracts";

function nowIso(): string {
  return new Date().toISOString();
}

type UpsertAlertInput = {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  transactionId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

export function upsertOpenAlert(db: MoneyTrackDb, input: UpsertAlertInput): string | null {
  const existing = db
    .select()
    .from(alerts)
    .all()
    .find((row) => {
      if (row.status !== "open" || row.type !== input.type) {
        return false;
      }
      if (input.transactionId && row.transactionId === input.transactionId) {
        return true;
      }
      if (input.dedupeKey && row.metadata) {
        try {
          const meta = JSON.parse(row.metadata) as { dedupeKey?: string };
          return meta.dedupeKey === input.dedupeKey;
        } catch {
          return false;
        }
      }
      return false;
    });

  if (existing) {
    return null;
  }

  const id = randomUUID();
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };

  db.insert(alerts)
    .values({
      id,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      transactionId: input.transactionId ?? null,
      status: "open",
      metadata: JSON.stringify(metadata),
      createdAt: nowIso(),
    })
    .run();

  return id;
}

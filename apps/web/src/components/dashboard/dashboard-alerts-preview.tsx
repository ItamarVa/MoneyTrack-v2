"use client";

/**
 * Top open alerts preview for the dashboard support row.
 */
import type { Alert, AlertSeverity, AlertType } from "@moneytrack/contracts";
import Link from "next/link";
import { formatIsoDateTime } from "@/lib/dates";

type DashboardAlertsPreviewProps = {
  alerts: Alert[];
  openCount: number;
  loading?: boolean;
};

const severityLabel: Record<AlertSeverity, string> = {
  info: "מידע",
  warning: "אזהרה",
  critical: "דחוף",
};

const typeLabel: Record<AlertType, string> = {
  anomaly: "סכום חריג",
  duplicate: "חיוב כפול",
  price_increase: "עליית מחיר",
  budget_variance: "חריגת תקציב",
  unmatched_settlement: "סליקה לא מותאמת",
};

function severityClass(severity: AlertSeverity): string {
  if (severity === "critical") return "text-brand-orange-500";
  if (severity === "warning") return "text-amber-600";
  return "text-text-secondary";
}

export function DashboardAlertsPreview({ alerts, openCount, loading }: DashboardAlertsPreviewProps) {
  const topAlerts = alerts.slice(0, 3);

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-text-primary">
          התראות
          {openCount > 0 ? (
            <span className="ms-2 rounded-full bg-brand-orange-500/15 px-2 py-0.5 text-sm text-brand-orange-500">
              {openCount}
            </span>
          ) : null}
        </h2>
        <Link href="/alerts" className="text-sm text-brand-blue-500 hover:underline">
          כל ההתראות
        </Link>
      </div>

      {loading ? (
        <p className="rounded-lg border border-border-subtle px-4 py-8 text-center text-sm text-text-muted">
          טוען התראות…
        </p>
      ) : topAlerts.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-8 text-center text-sm text-text-muted">
          אין התראות פתוחות
        </p>
      ) : (
        <ul className="space-y-3">
          {topAlerts.map((alert) => (
            <li
              key={alert.id}
              className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-3"
            >
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-surface-card px-2 py-0.5 text-text-secondary">
                  {typeLabel[alert.type]}
                </span>
                <span className={["font-medium", severityClass(alert.severity)].join(" ")}>
                  {severityLabel[alert.severity]}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-text-primary">{alert.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-text-muted">{alert.message}</p>
              <p className="mt-2 text-xs text-text-muted">{formatIsoDateTime(alert.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

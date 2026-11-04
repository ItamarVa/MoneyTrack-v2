"use client";

/**
 * Open alerts on the attention page: compact rows with "view" (the flagged transaction, or the
 * alerts page when there is none) and "dismiss" (same PATCH the alerts page uses).
 * Shows the newest few; the rest are one tap away on /alerts.
 */
import type { Alert } from "@moneytrack/contracts";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { dismissAlert } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.attention.alerts;
const VISIBLE = 5;
const buttonClass =
  "flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-primary";

type AlertsBlockProps = {
  alerts: Alert[];
  onDismissed: (id: string) => void;
};

export function AlertsBlock({ alerts, onDismissed }: AlertsBlockProps) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (alerts.length === 0) return null;

  async function dismiss(id: string): Promise<void> {
    setBusyId(id);
    try {
      await dismissAlert(id);
      onDismissed(id);
    } catch {
      showToast(copy.dismissError, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      aria-labelledby="attention-alerts-title"
      className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <h2
        id="attention-alerts-title"
        className="flex items-center gap-2 font-display text-lg text-text-primary"
      >
        <Icon icon={Bell} size={18} className="text-brand-blue-500" />
        {copy.title} ({alerts.length})
      </h2>
      <ul className="space-y-4">
        {alerts.slice(0, VISIBLE).map((alert) => (
          <li key={alert.id} className="space-y-2">
            <div>
              <p className="text-sm font-medium text-text-primary">{alert.title}</p>
              <p className="line-clamp-2 text-xs leading-5 text-text-muted">{alert.message}</p>
            </div>
            <div className="flex gap-2">
              <Link
                href={alert.transactionId ? `/transactions?highlight=${alert.transactionId}` : "/alerts"}
                className={buttonClass}
              >
                {copy.view}
              </Link>
              <button
                type="button"
                disabled={busyId === alert.id}
                onClick={() => void dismiss(alert.id)}
                className={`${buttonClass} disabled:opacity-60`}
              >
                {copy.dismiss}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {alerts.length > VISIBLE ? (
        <Link href="/alerts" className="block text-center text-sm font-medium text-brand-blue-500">
          {copy.all}
        </Link>
      ) : null}
    </section>
  );
}

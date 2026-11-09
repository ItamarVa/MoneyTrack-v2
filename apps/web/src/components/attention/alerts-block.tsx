"use client";

/**
 * Open alerts on the attention page: every open alert as one compact row, with "view" (filtered
 * transactions, see alerts/alert-link.ts) and "dismiss" (same PATCH the alerts page uses).
 */
import type { Alert } from "@moneytrack/contracts";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { alertViewHref } from "@/components/alerts/alert-link";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { dismissAlert } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.attention.alerts;
const buttonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-medium hover:bg-surface-elevated";

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
      <ul className="divide-y divide-border-subtle">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-center gap-1 py-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{alert.title}</p>
              <p className="line-clamp-2 text-xs leading-5 text-text-muted">{alert.message}</p>
            </div>
            <Link
              href={alertViewHref(alert)}
              aria-label={copy.viewAria.replace("{title}", alert.title)}
              className={`${buttonClass} text-brand-blue-500`}
            >
              {copy.view}
            </Link>
            <button
              type="button"
              disabled={busyId === alert.id}
              aria-label={copy.dismissAria.replace("{title}", alert.title)}
              onClick={() => void dismiss(alert.id)}
              className={`${buttonClass} text-text-secondary disabled:opacity-60`}
            >
              {copy.dismiss}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

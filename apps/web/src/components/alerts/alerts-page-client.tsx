"use client";

/**
 * Alerts inbox with filters, bulk dismiss, and session-persisted dismissed history.
 * Server only returns open alerts; dismissed tab uses local archive after successful PATCH.
 */
import type { Alert, AlertSeverity, AlertType } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { dismissAlert, fetchAlerts } from "@/lib/api-client";
import { formatIsoDateTime } from "@/lib/dates";

const DISMISSED_KEY = "moneytrack-dismissed-alerts";

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

type ViewMode = "open" | "dismissed";

function loadDismissedArchive(): Alert[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Alert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDismissedArchive(alerts: Alert[]): void {
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(alerts));
}

export function AlertsPageClient() {
  const { showToast } = useToast();
  const [openAlerts, setOpenAlerts] = useState<Alert[]>([]);
  const [dismissedArchive, setDismissedArchive] = useState<Alert[]>([]);
  const [view, setView] = useState<ViewMode>("open");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  /** Silent after the first fetch — see the note in settings/rules-panel.tsx. */
  const load = useCallback(async () => {
    setError(null);
    try {
      setOpenAlerts(await fetchAlerts());
      setDismissedArchive(loadDismissedArchive());
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת התראות");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceAlerts = view === "open" ? openAlerts : dismissedArchive;

  const filtered = useMemo(() => {
    return sourceAlerts.filter((alert) => {
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (typeFilter !== "all" && alert.type !== typeFilter) return false;
      return true;
    });
  }, [sourceAlerts, severityFilter, typeFilter]);

  async function dismissOne(id: string) {
    const alert = openAlerts.find((row) => row.id === id);
    if (!alert) return;

    setDismissing(true);
    try {
      const updated = await dismissAlert(id);
      setOpenAlerts((prev) => prev.filter((row) => row.id !== id));
      const archived = [{ ...updated, status: "dismissed" as const }, ...dismissedArchive];
      setDismissedArchive(archived);
      saveDismissedArchive(archived);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast("התראה נסגרה", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שגיאה בסגירת התראה", "error");
    } finally {
      setDismissing(false);
    }
  }

  async function dismissSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;

    setDismissing(true);
    const succeeded: Alert[] = [];
    const failed: string[] = [];

    for (const id of ids) {
      const alert = openAlerts.find((row) => row.id === id);
      if (!alert) continue;
      try {
        const updated = await dismissAlert(id);
        succeeded.push({ ...updated, status: "dismissed" });
      } catch {
        failed.push(id);
      }
    }

    if (succeeded.length > 0) {
      const succeededIds = new Set(succeeded.map((row) => row.id));
      setOpenAlerts((prev) => prev.filter((row) => !succeededIds.has(row.id)));
      const archived = [...succeeded, ...dismissedArchive];
      setDismissedArchive(archived);
      saveDismissedArchive(archived);
      setSelected(new Set(failed));
      showToast(`${succeeded.length} התראות נסגרו`, "success");
    }
    if (failed.length > 0) {
      showToast(`${failed.length} התראות לא נסגרו`, "error");
    }

    setDismissing(false);
    setBulkConfirm(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((row) => row.id)));
    }
  }

  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
        טוען התראות…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-brand-orange-500/40 bg-surface-card px-6 py-8 text-center text-brand-orange-500">
        {error}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex rounded-lg border border-border-subtle p-1">
          <button
            type="button"
            onClick={() => {
              setView("open");
              setSelected(new Set());
            }}
            className={[
              "min-h-11 rounded-md px-3 py-2 text-sm font-medium",
              view === "open" ? "bg-brand-orange-500 text-white" : "text-text-secondary",
            ].join(" ")}
          >
            פתוחות ({openAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setView("dismissed");
              setSelected(new Set());
            }}
            className={[
              "min-h-11 rounded-md px-3 py-2 text-sm font-medium",
              view === "dismissed" ? "bg-brand-orange-500 text-white" : "text-text-secondary",
            ].join(" ")}
          >
            שנסגרו ({dismissedArchive.length})
          </button>
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | "all")}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm sm:flex-none"
          aria-label="סינון לפי חומרה"
        >
          <option value="all">כל החומרות</option>
          <option value="info">מידע</option>
          <option value="warning">אזהרה</option>
          <option value="critical">דחוף</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AlertType | "all")}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm sm:flex-none"
          aria-label="סינון לפי סוג"
        >
          <option value="all">כל הסוגים</option>
          {Object.entries(typeLabel).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {view === "open" && filtered.length > 0 ? (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-sm text-brand-blue-500 hover:underline"
          >
            {selected.size === filtered.length ? "ביטול בחירה" : "בחירת הכל"}
          </button>
        ) : null}

        {view === "open" && selected.size > 0 ? (
          <button
            type="button"
            disabled={dismissing}
            onClick={() => setBulkConfirm(true)}
            className="min-h-11 rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-60"
          >
            סגירת {selected.size} נבחרות
          </button>
        ) : null}
      </div>

      {view === "dismissed" && dismissedArchive.length === 0 ? (
        <EmptyState
          title="אין התראות שנסגרו"
          description="התראות שתסגרו יופיעו כאן במהלך הסשן הנוכחי."
        />
      ) : null}

      {view === "open" && openAlerts.length === 0 ? (
        <EmptyState
          title="אין התראות פתוחות"
          description="כשהמערכת תזהה חריגות, מנויים או חריגות תקציב — הן יופיעו כאן."
        />
      ) : null}

      {filtered.length === 0 && sourceAlerts.length > 0 ? (
        <p className="text-center text-sm text-text-muted">אין התראות לפי הסינון הנוכחי.</p>
      ) : null}

      {filtered.map((alert) => (
        <article
          key={alert.id}
          className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              {view === "open" ? (
                <input
                  type="checkbox"
                  checked={selected.has(alert.id)}
                  onChange={() => toggleSelect(alert.id)}
                  className="mt-1 size-5 shrink-0 rounded border-border-subtle"
                  aria-label={`בחירת ${alert.title}`}
                />
              ) : null}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-surface-elevated px-2 py-1 text-text-secondary">
                    {typeLabel[alert.type]}
                  </span>
                  <span
                    className={[
                      "rounded-full px-2 py-1",
                      alert.severity === "critical"
                        ? "bg-brand-orange-500/15 text-brand-orange-500"
                        : alert.severity === "warning"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-brand-blue-500/15 text-brand-blue-500",
                    ].join(" ")}
                  >
                    {severityLabel[alert.severity]}
                  </span>
                  <span className="text-text-muted">{formatIsoDateTime(alert.createdAt)}</span>
                </div>
                <h2 className="font-display text-lg text-text-primary">{alert.title}</h2>
                <p className="text-sm text-text-secondary">{alert.message}</p>
                {alert.transactionId ? (
                  <Link
                    href={`/transactions?highlight=${alert.transactionId}`}
                    className="text-sm text-brand-blue-500 hover:underline"
                  >
                    צפייה בעסקה
                  </Link>
                ) : null}
              </div>
            </div>
            {view === "open" ? (
              <button
                type="button"
                disabled={dismissing}
                onClick={() => void dismissOne(alert.id)}
                className="min-h-11 shrink-0 rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated disabled:opacity-60"
              >
                סגירה
              </button>
            ) : null}
          </div>
        </article>
      ))}

      <ConfirmDialog
        open={bulkConfirm}
        title="סגירת התראות"
        message={`לסגור ${selected.size} התראות נבחרות?`}
        confirmLabel="סגירה"
        tone="danger"
        onConfirm={() => void dismissSelected()}
        onCancel={() => setBulkConfirm(false)}
      />
    </div>
  );
}

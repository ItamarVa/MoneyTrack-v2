"use client";

/**
 * Alerts inbox: dense one-row-per-alert list (two lines on a phone), type chips with counts,
 * per-type and selection bulk dismiss, session-persisted dismissed history.
 * Server only returns open alerts; dismissed tab uses local archive after successful PATCH.
 * No bulk-close endpoint exists, so bulk actions loop the single PATCH behind a confirmation.
 */
import type { Alert, AlertSeverity, AlertType } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { dismissAlert, fetchAlerts } from "@/lib/api-client";
import { formatIsoDateTime } from "@/lib/dates";
import he from "@/locales/he.json";
import { alertViewHref } from "./alert-link";
import { ChipGroup } from "./alert-filter-chips";
import { notifyAlertsChanged } from "./use-open-alerts-count";

const DISMISSED_KEY = "moneytrack-dismissed-alerts";

const severityLabel: Record<AlertSeverity, string> = {
  info: "מידע",
  warning: "אזהרה",
  critical: "דחוף",
};

const severityDot: Record<AlertSeverity, string> = {
  info: "bg-brand-blue-500",
  warning: "bg-amber-500",
  critical: "bg-brand-orange-500",
};

const typeLabel: Record<AlertType, string> = {
  anomaly: "סכום חריג",
  duplicate: "חיוב כפול",
  price_increase: "עליית מחיר",
  budget_variance: "חריגת תקציב",
  unmatched_settlement: he.plainUx.alerts.unmatchedSettlement,
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
  const [typeConfirm, setTypeConfirm] = useState(false);

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

  const typeCounts = useMemo(() => {
    const counts = new Map<AlertType, number>();
    for (const alert of sourceAlerts) counts.set(alert.type, (counts.get(alert.type) ?? 0) + 1);
    return counts;
  }, [sourceAlerts]);

  /** Everything currently shown for the chosen type (respects the severity filter). */
  const typeFilterIds = typeFilter === "all" ? [] : filtered.map((row) => row.id);

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
      notifyAlertsChanged();
      showToast("התראה נסגרה", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שגיאה בסגירת התראה", "error");
    } finally {
      setDismissing(false);
    }
  }

  async function dismissMany(ids: string[]) {
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
      notifyAlertsChanged();
      showToast(he.alerts.alerts.closeAllDone.replace("{count}", String(succeeded.length)), "success");
    }
    if (failed.length > 0) {
      showToast(he.alerts.alerts.closeAllFailed.replace("{count}", String(failed.length)), "error");
    }

    setDismissing(false);
    setBulkConfirm(false);
    setTypeConfirm(false);
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
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex rounded-lg border border-border-subtle p-1">
          <button
            type="button"
            onClick={() => {
              setView("open");
              setSelected(new Set());
              setTypeFilter("all");
            }}
            className={[
              "min-h-9 rounded-md px-3 py-1 text-sm font-medium",
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
              setTypeFilter("all");
            }}
            className={[
              "min-h-9 rounded-md px-3 py-1 text-sm font-medium",
              view === "dismissed" ? "bg-brand-orange-500 text-white" : "text-text-secondary",
            ].join(" ")}
          >
            שנסגרו ({dismissedArchive.length})
          </button>
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | "all")}
          className="min-h-9 min-w-0 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
          aria-label="סינון לפי חומרה"
        >
          <option value="all">כל החומרות</option>
          <option value="info">מידע</option>
          <option value="warning">אזהרה</option>
          <option value="critical">דחוף</option>
        </select>

        {view === "open" && filtered.length > 0 ? (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="hidden text-sm text-brand-blue-500 hover:underline md:block"
          >
            {selected.size === filtered.length ? "ביטול בחירה" : "בחירת הכל"}
          </button>
        ) : null}

        {view === "open" && selected.size > 0 ? (
          <button
            type="button"
            disabled={dismissing}
            onClick={() => setBulkConfirm(true)}
            className="hidden min-h-9 rounded-lg border border-border-subtle px-3 text-sm hover:bg-surface-elevated disabled:opacity-60 md:block"
          >
            סגירת {selected.size} נבחרות
          </button>
        ) : null}
      </div>

      {sourceAlerts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ChipGroup
            label={he.alerts.alerts.filterByType}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: he.alertsUx.all, count: sourceAlerts.length },
              ...(Object.keys(typeLabel) as AlertType[])
                .filter((value) => typeCounts.has(value))
                .map((value) => ({ value, label: typeLabel[value], count: typeCounts.get(value) ?? 0 })),
            ]}
          />
          {view === "open" && typeFilter !== "all" && typeFilterIds.length > 0 ? (
            <button
              type="button"
              disabled={dismissing}
              onClick={() => setTypeConfirm(true)}
              className="min-h-9 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary hover:bg-surface-elevated disabled:opacity-60"
            >
              {he.alerts.alerts.closeAllOfType}
            </button>
          ) : null}
        </div>
      ) : null}

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

      {filtered.length > 0 ? (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-surface-card">
          {filtered.map((alert) => (
            <li key={alert.id} className="flex min-w-0 items-center gap-2 px-3 py-1.5">
              {view === "open" ? (
                <input
                  type="checkbox"
                  checked={selected.has(alert.id)}
                  onChange={() => toggleSelect(alert.id)}
                  className="hidden size-4 shrink-0 rounded border-border-subtle md:block"
                  aria-label={`בחירת ${alert.title}`}
                />
              ) : null}
              <span
                role="img"
                aria-label={severityLabel[alert.severity]}
                title={severityLabel[alert.severity]}
                className={`size-2.5 shrink-0 rounded-full ${severityDot[alert.severity]}`}
              />
              <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
                <div className="flex min-w-0 items-baseline gap-2 md:w-60 md:shrink-0">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary" title={alert.title}>
                    {alert.title}
                  </p>
                  <span className="shrink-0 text-xs text-text-muted md:hidden">
                    {formatIsoDateTime(alert.createdAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-text-secondary md:flex-1 md:text-sm" title={alert.message}>
                  {alert.message}
                </p>
                <span className="hidden shrink-0 text-xs text-text-muted md:block">
                  {formatIsoDateTime(alert.createdAt)}
                </span>
              </div>
              <div className="flex shrink-0 items-center">
                {alert.transactionId || alert.metadata ? (
                  <Link
                    href={alertViewHref(alert)}
                    aria-label={`${he.attention.alerts.view}: ${alert.title}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-brand-blue-500 hover:bg-surface-elevated md:min-h-9"
                  >
                    {he.attention.alerts.view}
                  </Link>
                ) : null}
                {view === "open" ? (
                  <button
                    type="button"
                    disabled={dismissing}
                    aria-label={`${he.alertsUx.dismiss}: ${alert.title}`}
                    onClick={() => void dismissOne(alert.id)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated disabled:opacity-60 md:min-h-9"
                  >
                    {he.alertsUx.dismiss}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={bulkConfirm}
        title="סגירת התראות"
        message={`לסגור ${selected.size} התראות נבחרות?`}
        confirmLabel="סגירה"
        tone="danger"
        onConfirm={() => void dismissMany([...selected])}
        onCancel={() => setBulkConfirm(false)}
      />
      <ConfirmDialog
        open={typeConfirm}
        title={he.alerts.alerts.closeAllTitle}
        message={he.alerts.alerts.closeAllMessage
          .replace("{count}", String(typeFilterIds.length))
          .replace("{type}", typeFilter === "all" ? "" : typeLabel[typeFilter])}
        confirmLabel="סגירה"
        tone="danger"
        onConfirm={() => void dismissMany(typeFilterIds)}
        onCancel={() => setTypeConfirm(false)}
      />
    </div>
  );
}

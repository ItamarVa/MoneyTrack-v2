"use client";

/**
 * "Reporting month" control for income transactions (shift by month, pick a month, or return to
 * the automatic rule). The parent performs the saves.
 * Used by: transaction-detail-drawer.
 */
import { formatMonthYear } from "@/lib/dates";
import { shiftPeriod } from "@/components/entity/entity-dimension";

type DrawerReportingPeriodProps = {
  chargeDateLabel: string;
  period: string;
  locked: boolean;
  saving: boolean;
  onPeriodChange: (next: string) => void;
  onSave: (next: string) => void;
  onReset: () => void;
};

export function DrawerReportingPeriod({
  chargeDateLabel,
  period,
  locked,
  saving,
  onPeriodChange,
  onSave,
  onReset,
}: DrawerReportingPeriodProps) {
  const step = (delta: 1 | -1) => {
    const next = shiftPeriod(period, delta);
    onPeriodChange(next);
    onSave(next);
  };
  const stepClass =
    "min-h-11 min-w-11 rounded border border-border-subtle px-2 text-sm hover:border-brand-blue-500/40 disabled:opacity-50";

  return (
    <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4">
      <h3 className="text-sm font-semibold text-text-primary">חודש הצגה</h3>
      <p className="text-xs text-text-muted">תאריך חיוב: {chargeDateLabel}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="חודש קודם"
          disabled={saving || !period}
          onClick={() => step(-1)}
          className={stepClass}
        >
          ‹
        </button>
        <input
          type="month"
          value={period}
          disabled={saving}
          onChange={(event) => {
            const next = event.target.value;
            onPeriodChange(next);
            if (next) onSave(next);
          }}
          className="min-h-11 rounded-lg border border-border-subtle bg-surface-card px-3 text-sm"
          aria-label="חודש הצגה"
        />
        <button
          type="button"
          aria-label="חודש הבא"
          disabled={saving || !period}
          onClick={() => step(1)}
          className={stepClass}
        >
          ›
        </button>
      </div>
      {period ? (
        <p className="text-xs text-text-secondary">
          {formatMonthYear(period)}
          {locked ? " · חריג ידני" : " · לפי כלל אוטומטי"}
        </p>
      ) : null}
      {locked ? (
        <button
          type="button"
          disabled={saving}
          onClick={onReset}
          className="min-h-11 text-xs font-medium text-brand-blue-500 disabled:opacity-50"
        >
          חזרה לכלל אוטומטי
        </button>
      ) : null}
    </section>
  );
}

/**
 * Shown on the dashboard instead of the KPI cards and rings when the selected month
 * has no transactions (1st of the month, or data not synced yet). Exists so the
 * screen never prints "0 ₪" and a bogus -100% for a month that simply has no data.
 * The button jumps the global period to the newest month that does have data.
 */
import he from "@/locales/he.json";

type DashboardEmptyMonthProps = {
  periodLabel: string;
  /** Newest "YYYY-MM" with data; the button is hidden when there is none. */
  latestPeriodWithData?: string | null;
  onGoToPeriod?: (period: string) => void;
};

export function DashboardEmptyMonth({
  periodLabel,
  latestPeriodWithData,
  onGoToPeriod,
}: DashboardEmptyMonthProps) {
  return (
    <section
      aria-label={periodLabel}
      className="rounded-card border border-border-subtle bg-surface-card p-6 text-center"
    >
      <p className="font-display text-lg text-text-primary">{he.dashboardUx.emptyMonth.title}</p>
      <p className="mt-2 text-sm text-text-secondary">{he.dashboardUx.emptyMonth.hint}</p>
      {latestPeriodWithData && onGoToPeriod ? (
        <button
          type="button"
          onClick={() => onGoToPeriod(latestPeriodWithData)}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-blue-500 px-5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-500"
        >
          {he.homeUx.emptyMonth.goToLatest}
        </button>
      ) : null}
    </section>
  );
}

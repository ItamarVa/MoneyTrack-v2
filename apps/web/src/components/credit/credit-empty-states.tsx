/**
 * The two friendly dead ends: no credit-card account yet (link to Accounts), and a month
 * with no card rows (button to the previous month, hidden on the all-period view where
 * there is no previous month to go to).
 */
import Link from "next/link";
import he from "@/locales/he.json";

const copy = he.creditPage.empty;

const PANEL = "rounded-card border border-border-subtle bg-surface-card p-6 text-center";
const BUTTON =
  "mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-blue-500 bg-brand-blue-500/15 px-5 text-sm font-semibold text-brand-blue-500";

export function CreditNoCards() {
  return (
    <section className={PANEL}>
      <p className="font-display text-lg text-text-primary">{copy.noCardsTitle}</p>
      <p className="mt-2 text-sm text-text-secondary">{copy.noCardsHint}</p>
      <Link href="/accounts" className={BUTTON}>
        {copy.toAccounts}
      </Link>
    </section>
  );
}

export function CreditEmptyMonth({ onPreviousMonth }: { onPreviousMonth: (() => void) | null }) {
  return (
    <section className={PANEL}>
      <p className="font-display text-lg text-text-primary">{copy.noMonthTitle}</p>
      <p className="mt-2 text-sm text-text-secondary">
        {onPreviousMonth ? copy.noMonthHint : copy.noDataHint}
      </p>
      {onPreviousMonth ? (
        <button type="button" onClick={onPreviousMonth} className={BUTTON}>
          {copy.prevMonth}
        </button>
      ) : null}
    </section>
  );
}

"use client";

/**
 * "Bank charge vs. card details" section: for the selected month, what the bank paid each card
 * against the card rows we hold for that charge month, plus recent months that do not add up.
 * A shortfall usually means a missing statement-file upload (Isracard/Amex). Fetches on its own
 * so a failure here never blanks the rest of the page. Rules: engine card-reconciliation.ts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { useGlobalPeriod } from "@/components/period/period-context";
import { formatIls } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { fetchCreditReconciliation } from "./credit-api";
import {
  monthLines,
  reconciliationWindow,
  recentProblems,
  STATEMENT_UPLOAD_ISSUERS,
  type CardMonth,
} from "./credit-reconciliation-utils";
import type { CardReconciliationRow } from "./credit-types";

const copy = he.creditPage.reconciliation;

type Props = { period: string; cardIds: readonly string[]; today: string };

function MonthLine({ line }: { line: CardMonth }) {
  const { entry } = line;
  const detailed = formatIls(entry.detailed);
  const upload = STATEMENT_UPLOAD_ISSUERS.has(line.institutionCode.toLowerCase());
  const shortBy = entry.diff ?? 0;
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-text-primary">{line.label}</p>
          <p className="text-xs text-text-muted tabular-nums">
            {entry.billed === null
              ? fillTemplate(copy.detailedOnly, { detailed })
              : fillTemplate(copy.amounts, { billed: formatIls(entry.billed), detailed })}
          </p>
        </div>
        {entry.status === "match" ? (
          <span className="shrink-0 text-sm font-medium text-green-700 dark:text-green-400">
            <span aria-hidden="true">✓ </span>
            {copy.match}
          </span>
        ) : null}
      </div>
      {entry.status === "mismatch" ? (
        <p className="mt-1 text-sm text-brand-orange-500">
          {shortBy > 0
            ? fillTemplate(upload ? copy.missing : copy.missingSync, { amount: formatIls(shortBy) })
            : fillTemplate(copy.extra, { amount: formatIls(-shortBy) })}
          {shortBy > 0 && upload ? (
            <>
              {" "}
              <Link href="/accounts#statement-help" className="underline underline-offset-2">
                {copy.uploadLink}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {entry.status === "no_bill" ? <p className="mt-1 text-sm text-brand-orange-500">{copy.noBill}</p> : null}
      {entry.status === "open" ? <p className="mt-1 text-xs text-text-muted">{copy.open}</p> : null}
      {entry.combined ? <p className="mt-1 text-xs text-text-muted">{copy.combined}</p> : null}
    </li>
  );
}

function problemText(line: CardMonth): string {
  const { entry } = line;
  if (entry.status === "no_bill") return copy.recentNoBill;
  const diff = entry.diff ?? 0;
  return diff > 0
    ? fillTemplate(copy.recentMissing, { amount: formatIls(diff) })
    : fillTemplate(copy.recentExtra, { amount: formatIls(-diff) });
}

export function CreditReconciliation({ period, cardIds, today }: Props) {
  const { setPeriod } = useGlobalPeriod();
  const [rows, setRows] = useState<CardReconciliationRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { from, to } = reconciliationWindow(period, today);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void fetchCreditReconciliation(from, to, today)
      .then((body) => {
        if (!cancelled) setRows(body.cards);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, today]);

  if (failed) {
    return (
      <section aria-label={copy.title} className="rounded-card border border-border-subtle bg-surface-card p-4 md:p-5">
        <h2 className="font-display text-lg text-text-primary">{copy.title}</h2>
        <p className="mt-2 text-sm text-text-muted">{copy.loadFailed}</p>
      </section>
    );
  }
  if (rows === null) return null;

  const lines = monthLines(rows, cardIds, period);
  const problems = recentProblems(rows, cardIds, period, today);

  return (
    <section aria-label={copy.title} className="rounded-card border border-border-subtle bg-surface-card p-4 md:p-5">
      <h2 className="font-display text-lg text-text-primary">{copy.title}</h2>
      <p className="mt-1 text-xs text-text-muted">{copy.hint}</p>

      {lines.length > 0 ? (
        <ul className="mt-2 divide-y divide-border-subtle">
          {lines.map((line) => (
            <MonthLine key={line.accountId} line={line} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">{copy.noData}</p>
      )}

      {problems.length > 0 ? (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="mb-1 text-xs text-text-muted">{copy.recentTitle}</p>
          <ul className="divide-y divide-border-subtle">
            {problems.map((line) => (
              <li key={`${line.accountId}|${line.entry.month}`}>
                <button
                  type="button"
                  onClick={() => setPeriod(line.entry.month)}
                  aria-label={fillTemplate(copy.goToMonth, { month: formatMonthYear(line.entry.month) })}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-start"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary">{formatMonthYear(line.entry.month)}</span>
                    <span className="block truncate text-xs text-text-muted">{line.label}</span>
                  </span>
                  <span className="shrink-0 text-sm text-brand-orange-500 tabular-nums">
                    <span aria-hidden="true">⚠ </span>
                    {problemText(line)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

"use client";

/**
 * Card-bill problems on the attention page: one row per card + month whose bank charge does not
 * match the card details (mismatch / no_bill). Presentational: the page loads the rows and passes
 * the problems (see card-bills-logic.ts). Renders nothing when there are none. Each row lists the
 * debits counted as the bill and, muted, the issuer's other debits left out of it (`extras`).
 * Every debit line opens the shared transaction detail drawer.
 */
import type { Category, Tag } from "@moneytrack/contracts";
import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { STATEMENT_UPLOAD_ISSUERS, type CardMonth } from "@/components/credit/credit-reconciliation-utils";
import { useGlobalPeriod } from "@/components/period/period-context";
import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";
import { Icon } from "@/components/ui/icon";
import { fetchCategories, fetchTags } from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import { formatMonthYear, formatShortDate } from "@/lib/dates";
import he from "@/locales/he.json";

const copy = he.alerts.cardBills;
const bills = he.cardBills;
const bank = he.creditPage.reconciliation;
const linkClass =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-brand-blue-500 hover:bg-surface-elevated";

type Debit = CardMonth["entry"]["debits"][number];

type DebitListProps = { debits: Debit[]; onOpen: (id: string) => void; strong?: boolean };

function DebitList({ debits, onOpen, strong = false }: DebitListProps) {
  return (
    <ul className="space-y-1 pb-2 tabular-nums">
      {debits.map((debit, i) => (
        <li key={`${debit.id}|${i}`}>
          <button
            type="button"
            onClick={() => onOpen(debit.id)}
            className="flex min-h-11 w-full flex-wrap items-center gap-x-2 rounded-lg px-1 text-start hover:bg-surface-elevated"
          >
            <span>{formatShortDate(debit.date)}</span>
            <span className={strong ? "font-medium text-text-primary" : undefined}>{formatIls(debit.amount)}</span>
            <span className="min-w-0 break-words">{debit.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CardBillsBlock({ problems }: { problems: CardMonth[] }) {
  const { setPeriod } = useGlobalPeriod();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const hasProblems = problems.length > 0;

  useEffect(() => {
    // Drawer-only data; fetched once the block has something to show. The list works without it.
    if (!hasProblems) return;
    void fetchTags().then(setTags, () => undefined);
    void fetchCategories().then(setCategories, () => undefined);
  }, [hasProblems]);

  if (problems.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-card-bills-title"
      className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <h2 id="attention-card-bills-title" className="flex items-center gap-2 font-display text-lg text-text-primary">
        <Icon icon={CreditCard} size={18} className="text-brand-blue-500" />
        {copy.title} ({problems.length})
      </h2>
      <ul className="divide-y divide-border-subtle">
        {problems.map((line) => {
          const { entry } = line;
          const month = formatMonthYear(entry.month);
          const diff = entry.diff ?? 0;
          const upload = STATEMENT_UPLOAD_ISSUERS.has(line.institutionCode.toLowerCase());
          const gap =
            entry.status === "no_bill"
              ? bank.recentNoBill
              : fillTemplate(diff > 0 ? bank.recentMissing : bank.recentExtra, { amount: formatIls(Math.abs(diff)) });
          const detailed = formatIls(entry.detailed);
          const extras = entry.extras ?? [];
          return (
            <li key={`${line.accountId}|${entry.month}`} className="flex flex-wrap items-center gap-x-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {line.label} · {month}
                </p>
                <p className="text-xs leading-5 text-text-muted tabular-nums">
                  {entry.billed === null
                    ? fillTemplate(bank.detailedOnly, { detailed })
                    : fillTemplate(copy.amounts, { billed: formatIls(entry.billed), detailed })}
                  {" · "}
                  <span className="text-brand-orange-500">{gap}</span>
                </p>
                <details className="text-xs text-text-muted">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-brand-blue-500">
                    {bills.debitsToggle}
                  </summary>
                  {entry.debits.length === 0 ? (
                    <p className="pb-2">{bills.debitsEmpty}</p>
                  ) : (
                    <DebitList debits={entry.debits} onOpen={setDetailId} strong />
                  )}
                </details>
                {extras.length > 0 ? (
                  <div className="pb-2 text-xs text-text-muted">
                    <p className="font-medium">{bills.extrasTitle}</p>
                    <p>{bills.extrasHint}</p>
                    <DebitList debits={extras} onOpen={setDetailId} />
                  </div>
                ) : null}
              </div>
              {upload && entry.status === "mismatch" && diff > 0 ? (
                <Link href="/settings?tab=connections#statement-help" className={linkClass}>
                  {copy.uploadLink}
                </Link>
              ) : null}
              <Link
                href={`/credit?month=${entry.month}`}
                onClick={() => setPeriod(entry.month)}
                aria-label={fillTemplate(copy.monthLinkAria, { month, card: line.label })}
                className={linkClass}
              >
                {copy.monthLink}
              </Link>
            </li>
          );
        })}
      </ul>
      <TransactionDetailDrawer
        open={detailId !== null}
        transactionId={detailId}
        tags={tags}
        categories={categories}
        onClose={() => setDetailId(null)}
        onChanged={() => undefined}
      />
    </section>
  );
}

"use client";

/**
 * Card transactions for the chosen month: description, amount, date, instalment progress
 * and a category chip that opens the shared chooser (CategoryPicker). Rows excluded from
 * totals are hidden so the list adds up to the ring above. Shows 20 rows at a time; the
 * full filterable table is one link away on /transactions.
 */
import type { Category, Transaction } from "@moneytrack/contracts";
import Link from "next/link";
import { useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { amountToneClass, formatTransactionAmountDisplay } from "@/lib/transaction-amounts";
import { formatShortDate } from "@/lib/dates";
import he from "@/locales/he.json";

const copy = he.creditPage.transactions;
const PAGE_SIZE = 20;

type CreditTransactionsProps = {
  rows: Transaction[];
  categories: Category[];
  /** accountId -> card label; only shown when more than one card is in play. */
  cardNames: ReadonlyMap<string, string> | null;
  allUrl: string;
  onRowChanged: (updated: Transaction) => void;
};

export function CreditTransactions({
  rows,
  categories,
  cardNames,
  allUrl,
  onRowChanged,
}: CreditTransactionsProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  if (rows.length === 0) return null;

  return (
    <section
      aria-label={copy.title}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-text-primary">{copy.title}</h2>
        <Link
          href={allUrl}
          className="inline-flex min-h-11 items-center text-sm text-brand-blue-500 hover:underline"
        >
          {copy.allLink}
        </Link>
      </div>

      <ul className="mt-1 divide-y divide-border-subtle">
        {rows.slice(0, visible).map((row) => {
          const display = formatTransactionAmountDisplay(row);
          const showInstallment = row.installmentTotal !== null && row.installmentTotal > 1;
          const cardName = cardNames?.get(row.accountId);
          return (
            <li key={row.id} className="space-y-1.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">
                  {row.descriptionRaw}
                </p>
                <div className="shrink-0 text-end">
                  <bdi
                    dir="ltr"
                    className={["block text-base font-medium tabular-nums", amountToneClass(display.tone)].join(" ")}
                  >
                    {display.text}
                  </bdi>
                  {display.secondary ? (
                    <bdi dir="ltr" className="block text-xs text-text-muted">
                      {display.secondary}
                    </bdi>
                  ) : null}
                </div>
              </div>
              <p className="flex flex-wrap gap-x-3 text-xs text-text-secondary">
                <span>{formatShortDate(row.transactionDate)}</span>
                {row.chargeDate !== row.transactionDate ? (
                  <span className="text-text-muted">
                    {fillTemplate(copy.chargeOn, { date: formatShortDate(row.chargeDate) })}
                  </span>
                ) : null}
                {showInstallment ? (
                  <span>
                    {fillTemplate(copy.installment, {
                      index: row.installmentIndex ?? 1,
                      total: row.installmentTotal ?? 1,
                    })}
                  </span>
                ) : null}
                {cardName ? <span className="text-text-muted">{cardName}</span> : null}
              </p>
              <CategoryPicker
                variant="chip"
                transactionId={row.id}
                value={row.categoryId}
                classificationSource={row.classificationSource}
                categories={categories}
                onChanged={onRowChanged}
              />
            </li>
          );
        })}
      </ul>

      {rows.length > visible ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="mt-2 min-h-11 w-full rounded-lg border border-border-strong text-sm font-medium text-text-primary hover:bg-surface-elevated"
        >
          {copy.showMore}
        </button>
      ) : null}
    </section>
  );
}

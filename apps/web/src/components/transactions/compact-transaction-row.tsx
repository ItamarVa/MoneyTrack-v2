"use client";

/**
 * One-line transaction row (two short lines on phones), shared by the credit and bank pages.
 * The whole row is one stretched button that calls onOpen (the caller opens TransactionDetailDrawer); the category chip sits above it so it stays independently clickable.
 * Card settlement rows show a read-only link to /credit instead of the picker.
 * The auto/manual badge of CategoryPicker is hidden here and surfaced as a tooltip instead.
 */
import type { Category, Transaction } from "@moneytrack/contracts";
import { CardSettlementLock, isCardSettlement } from "@/components/bank/card-settlement-lock";
import { fillTemplate } from "@/components/category/category-options";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { formatShortDate } from "@/lib/dates";
import { amountToneClass, formatTransactionAmountDisplay } from "@/lib/transaction-amounts";
import he from "@/locales/he.json";

const copy = he.compactRow;
const pickerCopy = he.categoryChooser;

type CompactTransactionRowProps = {
  row: Transaction;
  categories: Category[];
  /** Short source label (card / account); omit or null to hide. */
  sourceLabel?: string | null;
  onOpen: (transactionId: string) => void;
  onRowChanged: (updated: Transaction) => void;
};

export function CompactTransactionRow({
  row,
  categories,
  sourceLabel,
  onOpen,
  onRowChanged,
}: CompactTransactionRowProps) {
  const display = formatTransactionAmountDisplay(row);
  const showInstalment = row.installmentTotal !== null && row.installmentTotal > 1;
  const sourceTitle =
    row.classificationSource === "manual"
      ? pickerCopy.manualBadge
      : row.classificationSource
        ? pickerCopy.autoBadge
        : undefined;

  const excluded = row.excludedFromTotals;
  const amount = (
    <span className="shrink-0 text-end" title={display.secondary ?? undefined}>
      <bdi
        dir="ltr"
        className={[
          "text-sm font-medium tabular-nums",
          excluded ? "text-text-muted line-through" : amountToneClass(display.tone),
        ].join(" ")}
      >
        {display.text}
      </bdi>
      {display.secondary ? (
        <bdi dir="ltr" className="ms-1 hidden text-xs text-text-muted md:inline">
          {display.secondary}
        </bdi>
      ) : null}
    </span>
  );

  const date = (
    <span className="shrink-0 text-xs text-text-secondary">{formatShortDate(row.transactionDate)}</span>
  );

  return (
    <li className="relative flex items-center gap-x-3 py-1.5" title={sourceTitle}>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        aria-label={fillTemplate(copy.openAria, { description: row.descriptionRaw })}
        className="absolute inset-0 rounded-md hover:bg-surface-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-500"
      />
      {/* Phone: line 1 description + amount, line 2 date + chip. Desktop: single line. */}
      <div className="pointer-events-none relative grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 md:flex">
        <div className="hidden w-14 shrink-0 md:block">{date}</div>
        <p className="flex min-w-0 items-center text-sm text-text-primary md:flex-1">
          <span className="truncate">{row.descriptionRaw}</span>
          {showInstalment ? (
            <span className="ms-2 shrink-0 text-xs text-text-muted">
              {fillTemplate(copy.instalment, {
                index: row.installmentIndex ?? 1,
                total: row.installmentTotal ?? 1,
              })}
            </span>
          ) : null}
          {excluded ? (
            <span className="ms-2 shrink-0 whitespace-nowrap rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-muted">
              {he.plainUx.transactionDrawer.excludedBadge}
            </span>
          ) : null}
        </p>
        {sourceLabel ? (
          <span className="hidden max-w-24 shrink-0 truncate text-xs text-text-muted md:inline">
            {sourceLabel}
          </span>
        ) : null}
        <div className="md:order-last">{amount}</div>
        <div className="pointer-events-auto col-span-2 flex min-w-0 items-center gap-2 md:col-span-1 md:w-44 md:shrink-0">
          <span className="md:hidden">{date}</span>
          <div className="min-w-0 [&>div>span.rounded-full]:hidden">
            {isCardSettlement(row) ? (
              <CardSettlementLock compact />
            ) : (
              <CategoryPicker
                transactionId={row.id}
                value={row.categoryId}
                classificationSource={row.classificationSource}
                categories={categories}
                onChanged={onRowChanged}
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

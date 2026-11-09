"use client";

/**
 * Phone transaction list: cards, grouped under a header per day (weekday, date, day totals)
 * when the list is sorted by date. Under any other sort the rows are flat, because a header per
 * run of equal dates would repeat meaninglessly. Desktop uses the virtualized table instead.
 * Used by: transaction-table.tsx.
 */
import type { Category, Tag, Transaction } from "@moneytrack/contracts";
import { MobileCardList, MobileCardListItem } from "@/components/mobile";
import { CategoryPicker } from "@/components/transactions/category-picker";

import { formatIls } from "@/lib/currency";
import { amountToneClass, formatTransactionAmountDisplay } from "@/lib/transaction-amounts";
import { sourceLabelFor, type SourceIndex } from "@/lib/transaction-source";
import he from "@/locales/he.json";
import { formatDayLabel, groupRowsByDay, type DayGroup } from "./transaction-day-groups";
import { KIND_LABELS } from "./transaction-kinds";

const copy = he.transactionsUx.day;

type TransactionMobileListProps = {
  rows: Transaction[];
  tagsById: Map<string, Tag>;
  categories: Category[];
  sourceIndex: SourceIndex;
  highlightId?: string | null;
  groupByDay: boolean;
  onOpenDetail: (id: string) => void;
  onRowChanged: (updated: Transaction) => void;
};

function DayHeader({ group }: { group: DayGroup<Transaction> }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-1 pt-3 text-xs text-text-secondary first:pt-0">
      <span className="font-semibold text-text-primary">{formatDayLabel(group.date)}</span>
      <span className="flex items-baseline gap-3">
        {group.expenseIls !== 0 ? (
          <span>
            {copy.expenses}{" "}
            <bdi dir="ltr" className="font-medium tabular-nums text-money-expense">
              {formatIls(group.expenseIls)}
            </bdi>
          </span>
        ) : null}
        {group.incomeIls !== 0 ? (
          <span>
            {copy.income}{" "}
            <bdi dir="ltr" className="font-medium tabular-nums text-money-income">
              {formatIls(group.incomeIls)}
            </bdi>
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** One-line meta under the description: date (when not grouped), kind, source, tags, excluded flag. */
function metaText(
  row: Transaction,
  showDate: boolean,
  tagsById: Map<string, Tag>,
  sourceIndex: SourceIndex,
): string {
  const parts: string[] = [];
  if (showDate) {
    parts.push(new Intl.DateTimeFormat("he-IL").format(new Date(`${row.transactionDate}T00:00:00`)));
  }
  parts.push(KIND_LABELS[row.kind] ?? row.kind, sourceLabelFor(row, sourceIndex));
  for (const id of row.tagIds ?? []) {
    const name = tagsById.get(id)?.name;
    if (name) parts.push(name);
  }
  if (row.excludedFromTotals) parts.push(copy.excludedBadge);
  return parts.join(" · ");
}

export function TransactionMobileList({
  rows,
  tagsById,
  categories,
  sourceIndex,
  highlightId,
  groupByDay,
  onOpenDetail,
  onRowChanged,
}: TransactionMobileListProps) {
  const groups: DayGroup<Transaction>[] = groupByDay
    ? groupRowsByDay(rows)
    : [{ date: "", rows, expenseIls: 0, incomeIls: 0 }];

  return (
    <MobileCardList>
      {groups.map((group, groupIndex) => (
        <GroupRows
          key={`${group.date}-${groupIndex}`}
          group={group}
          showHeader={groupByDay}
          showDate={!groupByDay}
          tagsById={tagsById}
          categories={categories}
          sourceIndex={sourceIndex}
          highlightId={highlightId}
          onOpenDetail={onOpenDetail}
          onRowChanged={onRowChanged}
        />
      ))}
    </MobileCardList>
  );
}

function GroupRows({
  group,
  showHeader,
  showDate,
  tagsById,
  categories,
  sourceIndex,
  highlightId,
  onOpenDetail,
  onRowChanged,
}: Omit<TransactionMobileListProps, "rows" | "groupByDay"> & {
  group: DayGroup<Transaction>;
  showHeader: boolean;
  showDate: boolean;
}) {
  return (
    <>
      {showHeader ? <DayHeader group={group} /> : null}
      {group.rows.map((row) => {
        const highlighted = highlightId === row.id;
        const display = formatTransactionAmountDisplay(row);
        return (
          <MobileCardListItem
            key={row.id}
            className={highlighted ? "bg-brand-orange-500/10 ring-2 ring-inset ring-brand-orange-500/40" : ""}
          >
            <div id={`tx-row-${row.id}`} className="space-y-1 text-start">
<button
type="button"
onClick={() => onOpenDetail(row.id)}
className="block w-full rounded-lg text-start active:bg-surface-elevated"
>
<div className="flex items-start justify-between gap-3">
<div className="min-w-0 flex-1">
<p className="truncate font-medium text-text-primary" title={row.descriptionRaw}>
{row.descriptionRaw}
</p>
</div>
                  <div className="shrink-0 text-end">
                    <bdi dir="ltr" className={["block font-medium tabular-nums", amountToneClass(display.tone)].join(" ")}>
                      {display.text}
                    </bdi>
                    {display.secondary ? (
                      <p className="text-xs text-text-muted">
                        <bdi dir="ltr">{display.secondary}</bdi>
                      </p>
                    ) : null}
                  </div>
                </div>
                </button>
<div className="flex items-center justify-between gap-2">
<button
type="button"
onClick={() => onOpenDetail(row.id)}
title={metaText(row, showDate, tagsById, sourceIndex)}
className="min-w-0 flex-1 truncate text-start text-xs text-text-secondary"
>
{metaText(row, showDate, tagsById, sourceIndex)}
</button>
<div className="max-w-[55%] shrink-0">
<CategoryPicker
compact
variant="chip"
transactionId={row.id}
value={row.categoryId}
classificationSource={row.classificationSource}
categories={categories}
onChanged={onRowChanged}
/>
</div>
</div>
            </div>
          </MobileCardListItem>
        );
      })}
    </>
  );
}

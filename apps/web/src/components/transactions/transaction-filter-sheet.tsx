"use client";

/**
 * Phone filter sheet: the same filters the desktop column menus offer (category, account or card,
 * kind, amount range, sort) plus text search, edited as one draft and applied together.
 * Applying emits the shared list-filter update shape, so the URL params match desktop exactly.
 * The body mounts only while the sheet is open, so the draft restarts from the live URL state.
 * Used by: transaction-filters-bar.tsx.
 */
import type { AnalysisFilter, Category, TransactionKind } from "@moneytrack/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { CategoryChooser } from "@/components/category/category-chooser";
import { fillTemplate } from "@/components/category/category-options";
import { BottomSheet } from "@/components/mobile";
import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";
import type { SourceOption } from "@/lib/transaction-source";
import he from "@/locales/he.json";
import {
  draftFromList,
  draftToUpdates,
  type FilterSheetDraft,
} from "./transaction-filter-sheet-draft";
import { KIND_OPTIONS } from "./transaction-kinds";
import type { ListFilterUpdates } from "./transaction-list-query";

const copy = he.transactionsUx.filters;

export type FilterSheetApply = {
  updates: ListFilterUpdates;
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
};

type FilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filter: AnalysisFilter;
  kinds?: TransactionKind[];
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
  categories: Category[];
  sources: SourceOption[];
  onApply: (result: FilterSheetApply) => void;
  onClearAll: () => void;
};

const SORT_CHOICES: { value: string; label: string }[] = [
  { value: "date:desc", label: copy.sortDateDesc },
  { value: "date:asc", label: copy.sortDateAsc },
  { value: "amount:desc", label: copy.sortAmountDesc },
  { value: "amount:asc", label: copy.sortAmountAsc },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5 text-sm text-text-primary";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "min-h-10 rounded-full px-4 text-sm font-medium transition",
        active ? "bg-brand-blue-500 text-white" : "bg-surface-elevated text-text-secondary",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function toggled<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

function SheetBody({
  filter,
  kinds,
  sortBy,
  sortDir,
  categories,
  sources,
  onApply,
  onClearAll,
}: Omit<FilterSheetProps, "open" | "onClose">) {
  const [draft, setDraft] = useState<FilterSheetDraft>(() =>
    draftFromList({ filter, kinds, sortBy, sortDir }),
  );
  const [chooserOpen, setChooserOpen] = useState(false);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const sortValue = `${draft.sortBy}:${draft.sortDir}`;
  const knownSort = SORT_CHOICES.some((choice) => choice.value === sortValue);
  const patch = (next: Partial<FilterSheetDraft>) => setDraft((current) => ({ ...current, ...next }));

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draftToUpdates(draft, sources));
      }}
    >
      <Section title={copy.search}>
        <input
          type="search"
          enterKeyHint="search"
          value={draft.freeText}
          onChange={(event) => patch({ freeText: event.target.value })}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.search}
          className={FIELD_CLASS}
        />
      </Section>

      <Section title={copy.category}>
        <div className="flex flex-wrap gap-2">
          {draft.categoryIds.map((id) => {
            const name = categoriesById.get(id) ?? id;
            return (
              <span
                key={id}
                className="inline-flex min-h-10 items-center gap-1 rounded-full bg-brand-blue-500 ps-4 pe-1 text-sm font-medium text-white"
              >
                <span className="truncate">{name}</span>
                <button
                  type="button"
                  aria-label={fillTemplate(copy.removeCategory, { name })}
                  onClick={() => patch({ categoryIds: draft.categoryIds.filter((item) => item !== id) })}
                  className="min-h-10 min-w-10 rounded-full leading-none"
                >
                  ×
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setChooserOpen(true)}
            className="min-h-10 rounded-full border border-border-subtle px-4 text-sm font-medium text-text-primary"
          >
            + {copy.addCategory}
          </button>
        </div>
        <CategoryChooser
          open={chooserOpen}
          onClose={() => setChooserOpen(false)}
          categories={categories}
          value={null}
          title={copy.categoryChooserTitle}
          onSelect={(categoryId) => {
            patch({
              categoryIds: draft.categoryIds.includes(categoryId)
                ? draft.categoryIds
                : [...draft.categoryIds, categoryId],
            });
            setChooserOpen(false);
          }}
        />
      </Section>

      {sources.length > 0 ? (
        <Section title={copy.source}>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <ToggleChip
                key={source.id}
                active={draft.sourceIds.includes(source.id)}
                onClick={() => patch({ sourceIds: toggled(draft.sourceIds, source.id) })}
              >
                {source.label}
              </ToggleChip>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={copy.kind}>
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((option) => (
            <ToggleChip
              key={option.value}
              active={draft.kinds.includes(option.value)}
              onClick={() => patch({ kinds: toggled(draft.kinds, option.value) })}
            >
              {option.label}
            </ToggleChip>
          ))}
        </div>
      </Section>

      <Section title={copy.amount}>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={draft.amountMin}
            onChange={(event) => patch({ amountMin: event.target.value })}
            placeholder={copy.amountMin}
            aria-label={copy.amountMin}
            dir="ltr"
            className={FIELD_CLASS}
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={draft.amountMax}
            onChange={(event) => patch({ amountMax: event.target.value })}
            placeholder={copy.amountMax}
            aria-label={copy.amountMax}
            dir="ltr"
            className={FIELD_CLASS}
          />
        </div>
      </Section>

      <Section title={copy.sort}>
        <select
          value={sortValue}
          onChange={(event) => {
            const [by, dir] = event.target.value.split(":");
            patch({ sortBy: by as TransactionSortBy, sortDir: dir as TransactionSortDir });
          }}
          aria-label={copy.sort}
          className={FIELD_CLASS}
        >
          {knownSort ? null : <option value={sortValue}>{copy.sortOther}</option>}
          {SORT_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border-subtle bg-surface-card px-4 pb-1 pt-3">
        <button
          type="submit"
          className="min-h-11 flex-1 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white"
        >
          {copy.apply}
        </button>
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium text-text-primary hover:bg-surface-elevated"
        >
          {copy.clearAll}
        </button>
      </div>
    </form>
  );
}

export function TransactionFilterSheet({ open, onClose, ...bodyProps }: FilterSheetProps) {
  return (
    <BottomSheet open={open} title={copy.sheetTitle} onClose={onClose}>
      <SheetBody {...bodyProps} />
    </BottomSheet>
  );
}

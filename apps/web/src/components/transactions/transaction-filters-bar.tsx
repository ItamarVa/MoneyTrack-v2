"use client";

/**
 * Transactions toolbar: free-text search and removable chips for every active
 * list filter (entity ids, kinds, amount range, search). Period is global.
 * On phones one prominent button opens the filter sheet (all filters, see
 * transaction-filter-sheet.tsx); desktop uses the column header menus.
 */
import type {
  Account,
  AnalysisFilter,
  Card,
  Category,
  Person,
  SalarySource,
  Tag,
  TransactionKind,
} from "@moneytrack/contracts";
import { useMemo, useState } from "react";
import { formatIls } from "@/lib/currency";
import { accountLabel } from "@/lib/account-label";
import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";
import type { SourceOption } from "@/lib/transaction-source";
import he from "@/locales/he.json";
import { TransactionFilterSheet, type FilterSheetApply } from "./transaction-filter-sheet";
import { KIND_LABELS } from "./transaction-kinds";
import type { ListFilterUpdates } from "./transaction-list-query";

const copy = he.transactionsUx.filters;

type MerchantOption = { id: string; name: string };

type FilterChipUpdate = ListFilterUpdates;

type ActiveFilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type TransactionFiltersBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  filter: AnalysisFilter;
  kinds?: TransactionKind[];
  categories: Category[];
  tags: Tag[];
  accounts: Account[];
  merchants: MerchantOption[];
  people: Person[];
  cards: Card[];
  salarySources: SalarySource[];
  sources: SourceOption[];
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
  onRemoveFilter: (updates: FilterChipUpdate) => void;
  onApplySheet: (result: FilterSheetApply) => void;
  onClearAll: () => void;
};

function withoutId(ids: string[] | undefined, id: string): string[] | undefined {
  const next = (ids ?? []).filter((item) => item !== id);
  return next.length > 0 ? next : undefined;
}

function withoutKind(kinds: TransactionKind[] | undefined, kind: TransactionKind): TransactionKind[] | undefined {
  const next = (kinds ?? []).filter((item) => item !== kind);
  return next.length > 0 ? next : undefined;
}

function amountChipLabel(filter: AnalysisFilter): string | null {
  const { amountMin, amountMax } = filter;
  if (amountMin === undefined && amountMax === undefined) return null;
  if (amountMin !== undefined && amountMax !== undefined) {
    return `סכום: ${formatIls(amountMin)} – ${formatIls(amountMax)}`;
  }
  if (amountMin !== undefined) return `סכום: מ-${formatIls(amountMin)}`;
  return `סכום: עד ${formatIls(amountMax!)}`;
}

function buildActiveFilterChips({
  filter,
  kinds,
  categories,
  tags,
  accounts,
  merchants,
  people,
  cards,
  salarySources,
  onRemoveFilter,
}: {
  filter: AnalysisFilter;
  kinds?: TransactionKind[];
  categories: Category[];
  tags: Tag[];
  accounts: Account[];
  merchants: MerchantOption[];
  people: Person[];
  cards: Card[];
  salarySources: SalarySource[];
  onRemoveFilter: (updates: FilterChipUpdate) => void;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const categoriesById = new Map(categories.map((row) => [row.id, row.name]));
  const tagsById = new Map(tags.map((row) => [row.id, row.name]));
  const accountsById = new Map(accounts.map((row) => [row.id, accountLabel({ ...row, last4: row.numberLast4 })]));
  const merchantsById = new Map(merchants.map((row) => [row.id, row.name]));
  const peopleById = new Map(people.map((row) => [row.id, row.displayName]));
  const cardsById = new Map(cards.map((row) => [row.id, accountLabel(row)]));

  for (const id of filter.categoryIds ?? []) {
    chips.push({
      key: `category-${id}`,
      label: `קטגוריה: ${categoriesById.get(id) ?? id}`,
      onRemove: () => onRemoveFilter({ filter: { categoryIds: withoutId(filter.categoryIds, id) } }),
    });
  }

  for (const id of filter.merchantIds ?? []) {
    chips.push({
      key: `merchant-${id}`,
      label: `${he.plainUx.filters.merchantChip} ${merchantsById.get(id) ?? id}`,
      onRemove: () => onRemoveFilter({ filter: { merchantIds: withoutId(filter.merchantIds, id) } }),
    });
  }

  for (const id of filter.personIds ?? []) {
    chips.push({
      key: `person-${id}`,
      label: `מחזיק: ${peopleById.get(id) ?? id}`,
      onRemove: () => onRemoveFilter({ filter: { personIds: withoutId(filter.personIds, id) } }),
    });
  }

  for (const id of filter.cardIds ?? []) {
    chips.push({
      key: `card-${id}`,
      label: `כרטיס: ${cardsById.get(id) ?? id}`,
      onRemove: () => onRemoveFilter({ filter: { cardIds: withoutId(filter.cardIds, id) } }),
    });
  }

  for (const id of filter.accountIds ?? []) {
    chips.push({
      key: `account-${id}`,
      label: `חשבון: ${accountsById.get(id) ?? id}`,
      onRemove: () => onRemoveFilter({ filter: { accountIds: withoutId(filter.accountIds, id) } }),
    });
  }

  for (const id of filter.tagIds ?? []) {
    chips.push({
      key: `tag-${id}`,
      label: `תגית: ${tagsById.get(id) ?? id}`,
      onRemove: () => onRemoveFilter({ filter: { tagIds: withoutId(filter.tagIds, id) } }),
    });
  }

  for (const kind of kinds ?? []) {
    chips.push({
      key: `kind-${kind}`,
      label: `סוג: ${KIND_LABELS[kind]}`,
      onRemove: () => onRemoveFilter({ kinds: withoutKind(kinds, kind) }),
    });
  }

  if (filter.salaryScope) {
    const sourceName = salarySources.find((row) => row.id === filter.salaryScope)?.displayName;
    chips.push({
      key: "salary-scope",
      label:
        filter.salaryScope === "other"
          ? "הכנסות אחרות"
          : `משכורת: ${sourceName ?? filter.salaryScope}`,
      onRemove: () => onRemoveFilter({ filter: { salaryScope: undefined } }),
    });
  }

  const amountLabel = amountChipLabel(filter);
  if (amountLabel) {
    chips.push({
      key: "amount",
      label: amountLabel,
      onRemove: () => onRemoveFilter({ filter: { amountMin: undefined, amountMax: undefined } }),
    });
  }

  const searchText = filter.freeText?.trim();
  if (searchText) {
    chips.push({
      key: "search",
      label: `חיפוש: ${searchText}`,
      onRemove: () => onRemoveFilter({ freeText: undefined }),
    });
  }

  return chips;
}

function FilterSearchForm({
  search,
  onSearchChange,
  onSearchSubmit,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchSubmit();
      }}
    >
      <label className="min-w-[12rem] flex-1 text-sm text-text-secondary">
        <span className="sr-only">{copy.search}</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={copy.searchPlaceholder}
          className="mt-0 w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5 text-sm text-text-primary"
        />
      </label>
      <button
        type="submit"
        className="min-h-11 rounded-lg border border-border-subtle bg-surface-card px-4 text-sm font-medium text-text-primary hover:bg-surface-elevated"
      >
        חפש
      </button>
    </form>
  );
}

function ActiveFilterChips({
  chips,
  onClearAll,
}: {
  chips: ActiveFilterChip[];
  onClearAll?: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={copy.activeFilters}>
      {chips.map((chip) => (
        <RemovableFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
      {onClearAll ? (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-9 rounded-full px-3 text-sm font-medium text-text-secondary underline"
        >
          {copy.clearAll}
        </button>
      ) : null}
    </div>
  );
}

function RemovableFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-blue-500/40 bg-brand-blue-500/10 px-3 py-1 text-sm text-brand-blue-500">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`הסרת סינון ${label}`}
        onClick={onRemove}
        className="shrink-0 rounded-full px-1 leading-none hover:bg-brand-blue-500/20"
      >
        ×
      </button>
    </span>
  );
}

export function TransactionFiltersBar({
  search,
  onSearchChange,
  onSearchSubmit,
  filter,
  kinds,
  categories,
  tags,
  accounts,
  merchants,
  people,
  cards,
  salarySources,
  sources,
  sortBy,
  sortDir,
  onRemoveFilter,
  onApplySheet,
  onClearAll,
}: TransactionFiltersBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeChips = useMemo(
    () =>
      buildActiveFilterChips({
        filter,
        kinds,
        categories,
        tags,
        accounts,
        merchants,
        people,
        cards,
        salarySources,
        onRemoveFilter,
      }),
    [filter, kinds, categories, tags, accounts, merchants, people, cards, salarySources, onRemoveFilter],
  );

  return (
    <>
      <div className="hidden space-y-3 md:block">
        <FilterSearchForm
          search={search}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
        />
        <ActiveFilterChips chips={activeChips} />
      </div>

      <div className="space-y-3 md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="min-h-12 w-full rounded-lg bg-brand-orange-500 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-brand-orange-400"
        >
          {copy.button}
          {activeChips.length > 0 ? ` (${activeChips.length})` : ""}
        </button>
        <ActiveFilterChips chips={activeChips} onClearAll={onClearAll} />
      </div>

      <TransactionFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filter={filter}
        kinds={kinds}
        sortBy={sortBy}
        sortDir={sortDir}
        categories={categories}
        sources={sources}
        onApply={(result) => {
          onApplySheet(result);
          setSheetOpen(false);
        }}
        onClearAll={() => {
          onClearAll();
          setSheetOpen(false);
        }}
      />
    </>
  );
}

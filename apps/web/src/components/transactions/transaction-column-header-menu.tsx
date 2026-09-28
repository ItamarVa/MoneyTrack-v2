"use client";

/**
 * Per-column header menu: sort ascending/descending plus a column-specific filter.
 * Wired to URL query params by the transactions page client.
 */
import type { AnalysisFilter, Category, TransactionKind } from "@moneytrack/contracts";
import { useEffect, useRef, useState } from "react";
import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";
import {
  selectedSourceIds,
  splitSourceIds,
  type SourceOption,
} from "@/lib/transaction-source";

export type TransactionColumnKey = "date" | "description" | "category" | "source" | "kind" | "amount";

const KIND_OPTIONS: { value: TransactionKind; label: string }[] = [
  { value: "expense", label: "הוצאה" },
  { value: "income", label: "הכנסה" },
  { value: "transfer", label: "העברה" },
  { value: "card_settlement", label: "סגירה" },
  { value: "refund", label: "זיכוי" },
  { value: "loan_payment", label: "הלוואה" },
];

const SORT_KEY_BY_COLUMN: Partial<Record<TransactionColumnKey, TransactionSortBy>> = {
  date: "date",
  description: "description",
  category: "category",
  kind: "kind",
  amount: "amount",
};

type TransactionColumnHeaderMenuProps = {
  label: string;
  columnKey: TransactionColumnKey;
  sortBy: TransactionSortBy;
  sortDir: TransactionSortDir;
  filter: AnalysisFilter;
  kinds?: TransactionKind[];
  categories: Category[];
  sources: SourceOption[];
  onApplySort: (column: TransactionSortBy, dir: TransactionSortDir) => void;
  onApplyFilter: (updates: {
    filter?: Partial<AnalysisFilter>;
    kinds?: TransactionKind[];
    freeText?: string;
  }) => void;
};

function columnHasFilter(
  columnKey: TransactionColumnKey,
  filter: AnalysisFilter,
  kinds?: TransactionKind[],
): boolean {
  switch (columnKey) {
    case "description":
      return Boolean(
        filter.freeText?.trim() ||
          filter.merchantIds?.length ||
          filter.tagIds?.length ||
          filter.personIds?.length,
      );
    case "category":
      return Boolean(filter.categoryIds?.length);
    case "source":
      return Boolean(filter.accountIds?.length || filter.cardIds?.length);
    case "kind":
      return Boolean(kinds?.length);
    case "amount":
      return filter.amountMin !== undefined || filter.amountMax !== undefined;
    default:
      return false;
  }
}

export function TransactionColumnHeaderMenu({
  label,
  columnKey,
  sortBy,
  sortDir,
  filter,
  kinds,
  categories,
  sources,
  onApplySort,
  onApplyFilter,
}: TransactionColumnHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sortKey = SORT_KEY_BY_COLUMN[columnKey];
  const sortSupported = columnKey !== "source" && sortKey !== undefined;
  const activeSort = sortSupported && sortBy === sortKey;
  const hasFilter = columnHasFilter(columnKey, filter, kinds);

  const [freeTextDraft, setFreeTextDraft] = useState(filter.freeText ?? "");
  const [categoryDraft, setCategoryDraft] = useState<string[]>(filter.categoryIds ?? []);
  const [sourceDraft, setSourceDraft] = useState<string[]>(selectedSourceIds(filter));
  const [kindsDraft, setKindsDraft] = useState<TransactionKind[]>(kinds ?? []);
  const [amountMinDraft, setAmountMinDraft] = useState(
    filter.amountMin !== undefined ? String(filter.amountMin) : "",
  );
  const [amountMaxDraft, setAmountMaxDraft] = useState(
    filter.amountMax !== undefined ? String(filter.amountMax) : "",
  );

  useEffect(() => {
    if (!open) return;
    setFreeTextDraft(filter.freeText ?? "");
    setCategoryDraft(filter.categoryIds ?? []);
    setSourceDraft(selectedSourceIds(filter));
    setKindsDraft(kinds ?? []);
    setAmountMinDraft(filter.amountMin !== undefined ? String(filter.amountMin) : "");
    setAmountMaxDraft(filter.amountMax !== undefined ? String(filter.amountMax) : "");
  }, [open, filter, kinds]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function applyColumnFilter(): void {
    switch (columnKey) {
      case "description":
        onApplyFilter({ freeText: freeTextDraft.trim() || undefined });
        break;
      case "category":
        onApplyFilter({
          filter: { categoryIds: categoryDraft.length ? categoryDraft : undefined },
        });
        break;
      case "source":
        onApplyFilter({ filter: splitSourceIds(sourceDraft, sources) });
        break;
      case "kind":
        onApplyFilter({ kinds: kindsDraft.length ? kindsDraft : undefined });
        break;
      case "amount": {
        const amountMin = amountMinDraft.trim() ? Number(amountMinDraft) : undefined;
        const amountMax = amountMaxDraft.trim() ? Number(amountMaxDraft) : undefined;
        onApplyFilter({
          filter: {
            amountMin: Number.isFinite(amountMin) ? amountMin : undefined,
            amountMax: Number.isFinite(amountMax) ? amountMax : undefined,
          },
        });
        break;
      }
      default:
        break;
    }
    setOpen(false);
  }

  function clearColumnFilter(): void {
    switch (columnKey) {
      case "description":
        onApplyFilter({ freeText: undefined });
        break;
      case "category":
        onApplyFilter({ filter: { categoryIds: undefined } });
        break;
      case "source":
        onApplyFilter({ filter: { accountIds: undefined, cardIds: undefined } });
        break;
      case "kind":
        onApplyFilter({ kinds: undefined });
        break;
      case "amount":
        onApplyFilter({ filter: { amountMin: undefined, amountMax: undefined } });
        break;
      default:
        break;
    }
    setOpen(false);
  }

  const filterSupported = columnKey !== "date";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          "flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-surface-card hover:text-text-primary",
          activeSort || hasFilter ? "text-text-primary" : "",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>{label}</span>
        {activeSort ? <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span> : null}
        {hasFilter ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-orange-500" aria-hidden="true" />
        ) : null}
        <span className="text-[10px] text-text-muted" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute start-0 top-full z-30 mt-1 min-w-[14rem] rounded-lg border border-border-subtle bg-surface-card p-2 text-xs shadow-lg"
        >
          {sortSupported ? (
            <>
              <p className="px-2 py-1 font-semibold text-text-muted">מיון</p>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onApplySort(sortKey!, "asc");
                  setOpen(false);
                }}
                className={[
                  "block w-full rounded-md px-2 py-1.5 text-start hover:bg-surface-elevated",
                  activeSort && sortDir === "asc" ? "bg-surface-elevated font-medium" : "",
                ].join(" ")}
              >
                מהקטן לגדול
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onApplySort(sortKey!, "desc");
                  setOpen(false);
                }}
                className={[
                  "block w-full rounded-md px-2 py-1.5 text-start hover:bg-surface-elevated",
                  activeSort && sortDir === "desc" ? "bg-surface-elevated font-medium" : "",
                ].join(" ")}
              >
                מהגדול לקטן
              </button>
            </>
          ) : null}

          {filterSupported ? (
            <>
              <p className={sortSupported ? "mt-2 px-2 py-1 font-semibold text-text-muted" : "px-2 py-1 font-semibold text-text-muted"}>
                סינון
              </p>
              {columnKey === "description" ? (
                <input
                  type="search"
                  value={freeTextDraft}
                  onChange={(event) => setFreeTextDraft(event.target.value)}
                  placeholder="טקסט בתיאור או בהערה"
                  className="mb-2 w-full rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs"
                />
              ) : null}
              {columnKey === "category" ? (
                <div className="mb-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border-subtle p-2">
                  {categories.map((category) => {
                    const checked = categoryDraft.includes(category.id);
                    return (
                      <label key={category.id} className="flex items-center gap-2 text-text-secondary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setCategoryDraft((current) =>
                              checked
                                ? current.filter((id) => id !== category.id)
                                : [...current, category.id],
                            );
                          }}
                        />
                        <span className="truncate">{category.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {columnKey === "source" ? (
                <div className="mb-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border-subtle p-2">
                  {sources.map((source) => {
                    const checked = sourceDraft.includes(source.id);
                    return (
                      <label
                        key={source.id}
                        className={[
                          "flex items-center gap-2 text-text-secondary",
                          source.kind === "card" ? "ps-4" : "",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSourceDraft((current) =>
                              checked
                                ? current.filter((id) => id !== source.id)
                                : [...current, source.id],
                            );
                          }}
                        />
                        <span className="truncate">{source.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {columnKey === "kind" ? (
                <div className="mb-2 space-y-1 rounded-md border border-border-subtle p-2">
                  {KIND_OPTIONS.map((option) => {
                    const checked = kindsDraft.includes(option.value);
                    return (
                      <label key={option.value} className="flex items-center gap-2 text-text-secondary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setKindsDraft((current) =>
                              checked
                                ? current.filter((kind) => kind !== option.value)
                                : [...current, option.value],
                            );
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {columnKey === "amount" ? (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={amountMinDraft}
                    onChange={(event) => setAmountMinDraft(event.target.value)}
                    placeholder="מינימום"
                    dir="ltr"
                    className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    value={amountMaxDraft}
                    onChange={(event) => setAmountMaxDraft(event.target.value)}
                    placeholder="מקסימום"
                    dir="ltr"
                    className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs"
                  />
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyColumnFilter}
                  className="flex-1 rounded-md bg-brand-blue-500 px-2 py-1.5 font-medium text-white"
                >
                  החל
                </button>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={clearColumnFilter}
                    className="rounded-md border border-border-subtle px-2 py-1.5 text-text-secondary hover:bg-surface-elevated"
                  >
                    נקה
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

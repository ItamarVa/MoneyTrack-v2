"use client";

import type { AnalysisFilter, Category, Person, Tag } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import {
  fetchCategories,
  fetchMerchants,
  fetchPeople,
  fetchTags,
} from "@/lib/api-client";

type MerchantOption = { id: string; name: string };

type AnalysisFilterDrawerProps = {
  open: boolean;
  filter: AnalysisFilter;
  onClose: () => void;
  onApply: (filter: AnalysisFilter) => void;
};

function countActiveFilters(filter: AnalysisFilter): number {
  let count = 0;
  if (filter.categoryIds?.length) count += 1;
  if (filter.tagIds?.length) count += 1;
  if (filter.personIds?.length) count += 1;
  if (filter.merchantIds?.length) count += 1;
  if (filter.amountMin !== undefined || filter.amountMax !== undefined) count += 1;
  if (filter.freeText) count += 1;
  return count;
}

function toggleId(list: string[] | undefined, id: string): string[] {
  const current = list ?? [];
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export function AnalysisFilterDrawer({
  open,
  filter,
  onClose,
  onApply,
}: AnalysisFilterDrawerProps) {
  const [draft, setDraft] = useState(filter);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(filter);
    void Promise.all([fetchCategories(), fetchTags(), fetchPeople(), fetchMerchants()]).then(
      ([categoryRows, tagRows, peopleRows, merchantRows]) => {
        setCategories(categoryRows);
        setTags(tagRows);
        setPeople(peopleRows);
        setMerchants(merchantRows);
      },
    );
  }, [open, filter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="סגור מסננים"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-card border border-border-subtle bg-surface-card p-5 shadow-xl sm:rounded-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-text-primary">מסננים</h2>
          <button type="button" onClick={onClose} className="text-sm text-text-muted">
            סגור
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-text-secondary">
              מתאריך
              <input
                type="date"
                value={draft.dateFrom ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, dateFrom: event.target.value || undefined })
                }
                className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-text-secondary">
              עד תאריך
              <input
                type="date"
                value={draft.dateTo ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, dateTo: event.target.value || undefined })
                }
                className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm text-text-secondary">
            בסיס תאריך
            <select
              value={draft.dateBasis}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  dateBasis: event.target.value as AnalysisFilter["dateBasis"],
                })
              }
              className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
            >
              <option value="transaction">תאריך עסקה</option>
              <option value="charge">תאריך חיוב</option>
            </select>
          </label>

          <FilterChipGroup
            label="קטגוריות"
            options={categories.map((row) => ({ id: row.id, label: row.name }))}
            selected={draft.categoryIds ?? []}
            onToggle={(id) =>
              setDraft({ ...draft, categoryIds: toggleId(draft.categoryIds, id) })
            }
          />

          <FilterChipGroup
            label="תגיות"
            options={tags.map((row) => ({ id: row.id, label: row.name }))}
            selected={draft.tagIds ?? []}
            onToggle={(id) => setDraft({ ...draft, tagIds: toggleId(draft.tagIds, id) })}
          />

          <FilterChipGroup
            label="מחזיקי כרטיס"
            options={people.map((row) => ({ id: row.id, label: row.displayName }))}
            selected={draft.personIds ?? []}
            onToggle={(id) => setDraft({ ...draft, personIds: toggleId(draft.personIds, id) })}
          />

          <FilterChipGroup
            label="סוחרים"
            options={merchants.map((row) => ({ id: row.id, label: row.name }))}
            selected={draft.merchantIds ?? []}
            onToggle={(id) =>
              setDraft({ ...draft, merchantIds: toggleId(draft.merchantIds, id) })
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-text-secondary">
              סכום מינימלי
              <input
                type="number"
                value={draft.amountMin ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    amountMin: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
                className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-text-secondary">
              סכום מקסימלי
              <input
                type="number"
                value={draft.amountMax ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    amountMax: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
                className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm text-text-secondary">
            חיפוש חופשי
            <input
              value={draft.freeText ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, freeText: event.target.value || undefined })
              }
              className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
              placeholder="תיאור עסקה"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setDraft({
                dateBasis: draft.dateBasis,
                dateFrom: draft.dateFrom,
                dateTo: draft.dateTo,
              })
            }
            className="rounded-lg px-4 py-2 text-sm text-text-muted"
          >
            נקה מסננים
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="rounded-lg bg-brand-orange-500 px-5 py-2 text-sm font-semibold text-white"
          >
            החל מסננים
          </button>
        </div>
      </div>
    </div>
  );
}

export function activeFilterCount(filter: AnalysisFilter): number {
  return countActiveFilters(filter);
}

function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="mb-2 text-sm text-text-secondary">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={`rounded-pill px-3 py-1.5 text-xs transition ${
                active
                  ? "bg-brand-blue-500 text-white"
                  : "border border-border-subtle bg-surface-elevated text-text-secondary"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

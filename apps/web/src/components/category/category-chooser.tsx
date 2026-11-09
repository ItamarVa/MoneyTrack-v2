"use client";

/**
 * Searchable, grouped category chooser: a bottom sheet on phones, a centred dialog from md up.
 * Replaces the flat <select> of every category. Filtering/grouping lives in category-options.ts.
 * Gotchas: rendered in a portal because the transactions table positions rows with transforms
 * (a fixed element inside one would be clipped); focus stays on the search box and the list is
 * driven through aria-activedescendant, so a tap or an arrow key never steals the keyboard.
 * Used by: transactions/category-picker.tsx, classify/category-select.tsx.
 */
import type { Category } from "@moneytrack/contracts";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import he from "@/locales/he.json";
import {
  buildCategoryGroups,
  categoryPathLabel,
  fillTemplate,
  flattenGroups,
  type CategoryOption,
} from "./category-options";

const copy = he.categoryChooser;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ResetAction = { label: string; hint?: string; onClick: () => void };

export type CategoryChooserProps = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  /** Currently chosen category id, marked in the list. */
  value: string | null;
  onSelect: (categoryId: string) => void;
  /** Category ids that must not be offered (e.g. the uncategorized bucket). */
  excludeIds?: readonly string[];
  /** Pinned row above the list, e.g. "back to automatic". */
  resetAction?: ResetAction;
  title?: string;
};

export function CategoryChooser({
  open,
  onClose,
  categories,
  value,
  onSelect,
  excludeIds,
  resetAction,
  title = copy.title,
}: CategoryChooserProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <ChooserPanel
      onClose={onClose}
      categories={categories}
      value={value}
      onSelect={onSelect}
      excludeIds={excludeIds}
      resetAction={resetAction}
      title={title}
    />,
    document.body,
  );
}

type PanelProps = Omit<CategoryChooserProps, "open"> & { title: string };

function ChooserPanel({ onClose, categories, value, onSelect, excludeIds, resetAction, title }: PanelProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-list`;
  const optionId = (id: string) => `${uid}-opt-${id}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => buildCategoryGroups(categories, query, { excludeIds }),
    [categories, query, excludeIds],
  );
  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Falls back to the chosen row, then the first row, whenever the filter changes the list.
  const effectiveActive =
    flat.find((option) => option.id === activeId)?.id ??
    flat.find((option) => option.id === value)?.id ??
    flat[0]?.id ??
    null;

  // Focus in on open, back to the opener on close; background scroll locked meanwhile.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    // A phone keyboard would cover half the list, so touch users tap the search box themselves.
    (finePointer ? inputRef.current : panelRef.current)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (!effectiveActive) return;
    document.getElementById(optionId(effectiveActive))?.scrollIntoView({ block: "nearest" });
  }, [effectiveActive]);

  function move(delta: number): void {
    if (flat.length === 0) return;
    const index = flat.findIndex((option) => option.id === effectiveActive);
    const next = (index + delta + flat.length) % flat.length;
    setActiveId(flat[next]!.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      if (flat[0]) setActiveId(flat[0].id);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      const lastOption = flat[flat.length - 1];
      if (lastOption) setActiveId(lastOption.id);
    } else if (event.key === "Enter" && effectiveActive) {
      event.preventDefault();
      onSelect(effectiveActive);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 md:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border-subtle bg-surface-card text-text-primary shadow-xl outline-none md:max-h-[70vh] md:max-w-md md:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-secondary"
          >
            {copy.close}
          </button>
        </div>

        <div className="relative px-4 pb-2 pt-3">
          <Icon
            icon={Search}
            size={18}
            className="pointer-events-none absolute start-7 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={effectiveActive ? optionId(effectiveActive) : undefined}
            aria-label={copy.searchLabel}
            placeholder={copy.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            enterKeyHint="done"
            className="min-h-11 w-full rounded-lg border border-border-strong bg-surface-bg ps-10 pe-3 text-base text-text-primary placeholder:text-text-muted"
          />
        </div>

        <p className="sr-only" role="status">
          {flat.length === 0 ? copy.noResults : fillTemplate(copy.resultsCount, { count: flat.length })}
        </p>

        {resetAction ? (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={resetAction.onClick}
              className="min-h-11 w-full rounded-lg border border-brand-blue-500/40 bg-brand-blue-500/10 px-3 py-2 text-start text-sm font-semibold text-brand-blue-500"
            >
              {resetAction.label}
              {resetAction.hint ? (
                <span className="mt-0.5 block text-xs font-normal text-text-secondary">
                  {resetAction.hint}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}

        <div
          id={listId}
          role="listbox"
          aria-label={title}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-muted">{copy.noResults}</p>
          ) : (
            groups.map((group) => (
              <div key={group.root.id} role="group" aria-label={group.root.name}>
                {[group.root, ...group.children].map((option) => (
                  <OptionRow
                    key={option.id}
                    option={option}
                    domId={optionId(option.id)}
                    selected={option.id === value}
                    active={option.id === effectiveActive}
                    showParent={query.trim() !== "" || option.ambiguous}
                    onPick={() => onSelect(option.id)}
                    onHover={() => setActiveId(option.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type OptionRowProps = {
  option: CategoryOption;
  domId: string;
  selected: boolean;
  active: boolean;
  showParent: boolean;
  onPick: () => void;
  onHover: () => void;
};

function OptionRow({ option, domId, selected, active, showParent, onPick, onHover }: OptionRowProps) {
  const isRoot = option.depth === 0;
  const indent = option.depth >= 2 ? "ps-12" : option.depth === 1 ? "ps-7" : "ps-3";
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      onClick={onPick}
      onMouseMove={onHover}
      className={[
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg pe-3 text-sm",
        indent,
        isRoot ? "font-semibold" : "font-normal",
        active ? "bg-surface-elevated" : "",
        selected ? "text-brand-blue-500" : "text-text-primary",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate">
        {option.name}
        {showParent && option.parentName ? (
          <span className="ms-2 text-xs font-normal text-text-muted">
            {option.parentName}
          </span>
        ) : null}
      </span>
      {selected ? (
        <>
          <Icon icon={Check} size={18} className="shrink-0" />
          <span className="sr-only">{copy.currentMark}</span>
        </>
      ) : null}
    </div>
  );
}

type CategoryChooserFieldProps = {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  excludeIds?: readonly string[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

/** Select-like button that opens the chooser; drop-in for the old <select>. */
export function CategoryChooserField({
  categories,
  value,
  onChange,
  disabled = false,
  excludeIds,
  placeholder = copy.placeholder,
  className,
  ariaLabel,
}: CategoryChooserFieldProps) {
  const [open, setOpen] = useState(false);
  const label = categoryPathLabel(categories, value);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          ariaLabel ?? fillTemplate(copy.changeAria, { current: label ?? placeholder })
        }
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex min-h-11 max-w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface-card px-2 text-start text-xs text-text-primary disabled:opacity-60 md:min-h-8"
        }
      >
        <span className={["min-w-0 truncate", label ? "" : "text-text-muted"].join(" ")}>
          {label ?? placeholder}
        </span>
        <Icon icon={ChevronDown} size={16} className="shrink-0 text-text-muted" />
      </button>
      <CategoryChooser
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        value={value}
        excludeIds={excludeIds}
        onSelect={(categoryId) => {
          setOpen(false);
          onChange(categoryId);
        }}
      />
    </>
  );
}

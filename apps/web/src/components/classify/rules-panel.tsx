"use client";

/**
 * Settings tab for categorization rules: search, compact list, CRUD via modal (rule-edit-dialog.tsx).
 * Rows are one line on desktop with icon actions beside the content, 2-line cards with a menu on
 * phone. Search is client-side (rules-filter.ts). Copy: locales/he.json (settingsRules).
 */
import type { CategorizationRule, Category } from "@moneytrack/contracts";
import { MoreHorizontal, Pencil, Power, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createRule, deleteRule, fetchCategories, fetchRules, updateRule } from "@/lib/api-client";
import { RuleEditDialog, type RuleFormValues } from "./rule-edit-dialog";
import { filterRules } from "./rules-filter";
import he from "@/locales/he.json";

type RowActionsProps = {
  rule: CategorizationRule;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const iconBtn =
  "inline-flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-card disabled:opacity-60";

function RowActions({ rule, disabled, onToggle, onEdit, onDelete }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleLabel = rule.enabled ? he.settingsRules.disable : he.settingsRules.enable;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const menuItem =
    "block min-h-11 w-full px-3 text-start text-sm hover:bg-surface-elevated disabled:opacity-60";

  return (
    <>
      <div className="hidden shrink-0 items-center gap-0.5 md:flex">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          title={toggleLabel}
          aria-label={toggleLabel}
          className={iconBtn}
        >
          <Power size={16} aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          title={he.settingsRules.edit}
          aria-label={he.settingsRules.edit}
          className={`${iconBtn} text-brand-blue-500`}
        >
          <Pencil size={16} aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          title={he.settingsRules.delete}
          aria-label={he.settingsRules.delete}
          className={`${iconBtn} text-red-500`}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
      <div ref={wrapRef} className="relative shrink-0 md:hidden">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={he.settingsRules.rowMenu.replace("{pattern}", rule.pattern)}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-11 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-card"
        >
          <MoreHorizontal size={18} aria-hidden />
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute end-0 top-full z-20 mt-1 min-w-36 overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-soft"
          >
            <button type="button" role="menuitem" disabled={disabled} onClick={run(onToggle)} className={menuItem}>
              {toggleLabel}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={run(onEdit)}
              className={`${menuItem} text-brand-blue-500`}
            >
              {he.settingsRules.edit}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={run(onDelete)}
              className={`${menuItem} text-red-500`}
            >
              {he.settingsRules.delete}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function RulesPanel() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** undefined = dialog closed, null = creating, rule = editing. */
  const [dialogRule, setDialogRule] = useState<CategorizationRule | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<CategorizationRule | null>(null);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const visible = useMemo(
    () => filterRules(rules, categoryNameById, query),
    [rules, categoryNameById, query],
  );

  /** Reloads silently after the first fetch so a save never collapses the list or resets scroll. */
  const load = useCallback(async () => {
    setError(null);
    try {
      const [ruleRows, categoryRows] = await Promise.all([fetchRules(), fetchCategories()]);
      setRules(ruleRows);
      setCategories(categoryRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : he.settingsRules.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(values: RuleFormValues) {
    const editing = dialogRule;
    const ok = await run(async () => {
      if (editing) await updateRule(editing.id, values);
      else await createRule({ ...values, enabled: true });
    }, he.settingsRules.saveFailed);
    if (ok) setDialogRule(undefined);
  }

  const closeDialog = useCallback(() => setDialogRule(undefined), []);

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-text-primary">{he.settingsRules.title}</h2>
          <p className="mt-1 text-sm text-text-muted">{he.settingsRules.description}</p>
        </div>
        <button
          type="button"
          disabled={loading || categories.length === 0}
          onClick={() => setDialogRule(null)}
          className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {he.settingsRules.add}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">{he.settingsRules.loading}</p>
      ) : rules.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{he.settingsRules.empty}</p>
      ) : (
        <div className="mt-4 max-w-3xl">
          <div className="relative">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={he.settingsRules.searchLabel}
              placeholder={he.settingsRules.searchPlaceholder}
              className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg ps-9 pe-3 text-sm"
            />
          </div>
          <p className="mt-2 text-xs text-text-muted" aria-live="polite">
            {he.settingsRules.showing
              .replace("{shown}", String(visible.length))
              .replace("{total}", String(rules.length))}
          </p>

          {visible.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">{he.settingsRules.noResults}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border-subtle rounded-lg bg-surface-elevated">
              {visible.map((rule) => (
                <li key={rule.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
                    <p className="truncate font-medium text-text-primary md:w-48 md:shrink-0">
                      <bdi dir="ltr">{rule.pattern}</bdi>
                    </p>
                    <p className="truncate text-xs text-text-muted md:text-sm">
                      {categoryNameById.get(rule.categoryId) ?? rule.categoryId} ·{" "}
                      {he.settingsRules.priorityShort.replace("{n}", String(rule.priority))}
                      {rule.enabled ? "" : ` · ${he.settingsRules.disabledBadge}`}
                    </p>
                  </div>
                  <RowActions
                    rule={rule}
                    disabled={saving}
                    onToggle={() =>
                      void run(() => updateRule(rule.id, { enabled: !rule.enabled }), he.settingsRules.updateFailed)
                    }
                    onEdit={() => setDialogRule(rule)}
                    onDelete={() => setToDelete(rule)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dialogRule !== undefined ? (
        <RuleEditDialog
          rule={dialogRule}
          categories={categories}
          saving={saving}
          onSave={handleSave}
          onClose={closeDialog}
        />
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title={he.settingsRules.deleteTitle}
        message={he.settingsRules.deleteMessage.replace("{pattern}", toDelete?.pattern ?? "")}
        confirmLabel={he.settingsRules.deleteConfirm}
        cancelLabel={he.settingsRules.cancel}
        tone="danger"
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target) void run(() => deleteRule(target.id), he.settingsRules.deleteFailed);
        }}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}

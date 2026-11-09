"use client";

/**
 * Modal for creating/editing one categorization rule (with live match-count preview).
 * Split from rules-panel.tsx so the form never renders below a long table. Focus is trapped
 * inside; Escape/backdrop/cancel close it, asking first when fields changed. Copy: pending/settings-rules.json.
 */
import type { CategorizationRule, Category } from "@moneytrack/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { previewRuleMatches } from "@/lib/api-client";
import he from "@/locales/he.json";

export type RuleFormValues = { pattern: string; categoryId: string; priority: number };

type Props = {
  /** null = create a new rule. */
  rule: CategorizationRule | null;
  categories: Category[];
  saving: boolean;
  onSave: (values: RuleFormValues) => void | Promise<void>;
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]';

export function RuleEditDialog({ rule, categories, saving, onSave, onClose }: Props) {
  const titleId = useId();
  const patternId = useId();
  const categoryFieldId = useId();
  const priorityId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const initial = {
    pattern: rule?.pattern ?? "",
    categoryId: rule?.categoryId ?? categories[0]?.id ?? "",
    priority: String(rule?.priority ?? 10),
  };
  const [pattern, setPattern] = useState(initial.pattern);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [priority, setPriority] = useState(initial.priority);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    pattern !== initial.pattern || categoryId !== initial.categoryId || priority !== initial.priority;

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  useEffect(() => {
    patternRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      setMatchCount(null);
      setPreviewPending(false);
      return;
    }
    setPreviewPending(true);
    const handle = window.setTimeout(() => {
      void previewRuleMatches(trimmed)
        .then(setMatchCount)
        .catch(() => setMatchCount(null))
        .finally(() => setPreviewPending(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [pattern]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && !confirmDiscard) {
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab" || confirmDiscard) return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = items?.[0];
    const last = items?.[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = pattern.trim();
    const parsed = Number.parseInt(priority, 10);
    if (!trimmed || !categoryId || !Number.isFinite(parsed)) return;
    void onSave({ pattern: trimmed, categoryId, priority: parsed });
  }

  const field = "mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-brand-navy-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card border border-border-subtle bg-surface-card p-5 shadow-soft sm:rounded-card"
      >
        <h2 id={titleId} className="font-display text-lg text-text-primary">
          {rule ? he.settingsRules.dialogEdit : he.settingsRules.dialogCreate}
        </h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label htmlFor={patternId} className="block text-sm text-text-primary">
              {he.settingsRules.patternLabel}
            </label>
            <input
              id={patternId}
              ref={patternRef}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={he.settingsRules.patternPlaceholder}
              className={field}
              dir="ltr"
            />
            <p className="mt-1 min-h-4 text-xs text-text-muted" aria-live="polite">
              {pattern.trim()
                ? previewPending
                  ? he.settingsRules.previewPending
                  : matchCount !== null
                    ? he.settingsRules.previewCount.replace("{n}", String(matchCount))
                    : null
                : null}
            </p>
          </div>
          <div>
            <label htmlFor={categoryFieldId} className="block text-sm text-text-primary">
              {he.settingsRules.categoryLabel}
            </label>
            <select
              id={categoryFieldId}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={field}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={priorityId} className="block text-sm text-text-primary">
              {he.settingsRules.priorityLabel}
            </label>
            <input
              id={priorityId}
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={field}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-60"
            >
              {he.settingsRules.cancel}
            </button>
            <button
              type="submit"
              disabled={saving || !pattern.trim() || !categoryId}
              className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? he.settingsRules.saving : rule ? he.settingsRules.saveUpdate : he.settingsRules.saveCreate}
            </button>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title={he.settingsRules.discardTitle}
        message={he.settingsRules.discardMessage}
        confirmLabel={he.settingsRules.discardConfirm}
        cancelLabel={he.settingsRules.discardKeep}
        tone="danger"
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

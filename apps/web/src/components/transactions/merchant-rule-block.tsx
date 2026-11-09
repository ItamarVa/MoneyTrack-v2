"use client";

/**
 * Secondary "apply this category to all of this merchant's transactions" control in the drawer.
 * Collapsed to a link; opening it fetches the live match count (nothing is requested while closed).
 * The pattern stays editable under an "advanced options" disclosure. createRule only; the
 * background reapply is queued by the rules route. createMerchantRule is also used by the
 * post-pick offer banner (merchant-rule-offer).
 */
import type { Transaction } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { useToast } from "@/components/ui/toast";
import { createRule, previewRuleMatches } from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import { suggestMerchantPattern } from "@/lib/merchant-pattern";
import he from "@/locales/he.json";

const copy = he.drawer.rule;

type MerchantRuleBlockProps = {
  transaction: Transaction;
  onApplied: () => void;
  /** Hide the link while the post-pick banner already offers the same thing. */
  hidden?: boolean;
};

/** The one place a merchant rule is built: same priority and enabled flag everywhere it is offered. */
export function createMerchantRule(pattern: string, categoryId: string) {
  return createRule({ pattern, categoryId, priority: 10, enabled: true });
}

function hasUsableCategory(categoryId: string | null): boolean {
  return categoryId !== null && categoryId !== UNCATEGORIZED_CATEGORY_ID;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500";

export function MerchantRuleBlock({ transaction, onApplied, hidden = false }: MerchantRuleBlockProps) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [pattern, setPattern] = useState(() =>
    suggestMerchantPattern(transaction.descriptionNormalized),
  );
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryId = transaction.categoryId;

  useEffect(() => {
    setPattern(suggestMerchantPattern(transaction.descriptionNormalized));
    setExpanded(false);
    setError(null);
  }, [transaction.id, transaction.descriptionNormalized]);

  useEffect(() => {
    if (!expanded) return;
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) {
      setMatchCount(null);
      return;
    }
    setPreviewPending(true);
    const handle = window.setTimeout(() => {
      void previewRuleMatches(trimmedPattern)
        .then(setMatchCount)
        .catch(() => setMatchCount(null))
        .finally(() => setPreviewPending(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [pattern, expanded]);

  const trimmed = pattern.trim();
  if (hidden || !hasUsableCategory(categoryId) || !trimmed) {
    return null;
  }
  const zeroMatches = matchCount === 0 && !previewPending;

  async function handleCreateRule(): Promise<void> {
    if (!trimmed || !categoryId || matchCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      await createMerchantRule(trimmed, categoryId);
      showToast(he.categoryChooser.ruleDone, "success");
      setExpanded(false);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : he.categoryChooser.ruleFailed);
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`inline-flex min-h-11 max-w-full items-center rounded-md px-1 text-start text-xs font-medium text-brand-blue-500 underline underline-offset-2 ${FOCUS}`}
      >
        <span className="truncate">{fillTemplate(copy.link, { merchant: trimmed })}</span>
      </button>
    );
  }

  return (
    <section
      aria-label={copy.title}
      className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated/40 p-3"
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text-primary">{copy.title}</p>
        <p className="text-xs leading-relaxed text-text-secondary">
          {fillTemplate(copy.body, { merchant: trimmed })}
        </p>
        <p role="status" className="text-xs text-text-muted">
          {previewPending
            ? copy.checking
            : zeroMatches
              ? copy.noMatches
              : matchCount !== null
                ? fillTemplate(copy.matchCount, { count: matchCount })
                : null}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-brand-orange-500">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={saving || previewPending || zeroMatches}
          onClick={() => void handleCreateRule()}
          className={`min-h-11 flex-1 rounded-lg bg-brand-blue-500 px-3 text-sm font-semibold text-white focus-visible:ring-offset-2 disabled:opacity-50 ${FOCUS}`}
        >
          {saving
            ? copy.saving
            : matchCount !== null && matchCount > 0
              ? fillTemplate(copy.applyWithCount, { count: matchCount })
              : copy.apply}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setExpanded(false)}
          className={`min-h-11 flex-1 rounded-lg border border-border-strong px-3 text-sm font-medium text-text-secondary disabled:opacity-60 ${FOCUS}`}
        >
          {copy.dismiss}
        </button>
      </div>
      <details className="text-xs text-text-secondary">
        <summary
          className={`flex min-h-11 cursor-pointer items-center rounded-md px-1 font-medium ${FOCUS}`}
        >
          {copy.advanced}
        </summary>
        <label className="mt-1 block space-y-1">
          <span className="block text-text-primary">{copy.patternLabel}</span>
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            dir="ltr"
            className={`min-h-11 w-full rounded-md border border-border-strong bg-surface-card px-2 text-sm text-text-primary ${FOCUS}`}
          />
          <span className="block text-text-muted">{copy.patternHint}</span>
        </label>
      </details>
    </section>
  );
}

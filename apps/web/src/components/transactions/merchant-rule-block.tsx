"use client";

/**
 * One-click merchant rule from the transaction drawer: editable pattern,
 * live match count, createRule only (background apply is track E).
 */
import type { Transaction } from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { createRule, fetchCategories, previewRuleMatches } from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import { suggestMerchantPattern } from "@/lib/merchant-pattern";

type MerchantRuleBlockProps = {
  transaction: Transaction;
  onApplied: () => void;
};

function hasUsableCategory(categoryId: string | null): boolean {
  return categoryId !== null && categoryId !== UNCATEGORIZED_CATEGORY_ID;
}

export function MerchantRuleBlock({ transaction, onApplied }: MerchantRuleBlockProps) {
  const [pattern, setPattern] = useState(() =>
    suggestMerchantPattern(transaction.descriptionNormalized),
  );
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryId = transaction.categoryId;

  useEffect(() => {
    setPattern(suggestMerchantPattern(transaction.descriptionNormalized));
    setError(null);
  }, [transaction.id, transaction.descriptionNormalized]);

  useEffect(() => {
    if (!hasUsableCategory(categoryId)) {
      return;
    }
    void fetchCategories().then((rows) => {
      const match = rows.find((row) => row.id === categoryId);
      setCategoryName(match?.name ?? null);
    });
  }, [categoryId]);

  useEffect(() => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      setMatchCount(null);
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

  const buttonLabel = useMemo(() => {
    const trimmed = pattern.trim();
    const label = categoryName ?? "קטגוריה";
    if (!trimmed || matchCount === null) {
      return `סווג אוטומטית עסקאות של ${trimmed || "…"} כ"${label}"`;
    }
    return `סווג אוטומטית ${matchCount} עסקאות של ${trimmed} כ"${label}"`;
  }, [pattern, matchCount, categoryName]);

  if (!hasUsableCategory(categoryId)) {
    return null;
  }

  async function handleCreateRule(): Promise<void> {
    const trimmed = pattern.trim();
    if (!trimmed || !categoryId || matchCount === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRule({
        pattern: trimmed,
        categoryId,
        priority: 10,
        enabled: true,
      });
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת כלל נכשלה");
    } finally {
      setSaving(false);
    }
  }

  const trimmed = pattern.trim();
  const zeroMatches = matchCount === 0 && !previewPending && trimmed.length > 0;

  return (
    <section className="space-y-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-3">
      <p className="text-xs font-medium text-text-primary">כלל סוחר לעסקאות דומות</p>
      <input
        value={pattern}
        onChange={(event) => setPattern(event.target.value)}
        className="w-full rounded-md border border-border-subtle bg-surface-card px-2 py-1.5 text-xs"
        dir="ltr"
        aria-label="תבנית סוחר"
      />
      {trimmed ? (
        <p className="text-[11px] text-text-muted">
          {previewPending
            ? "בודק התאמות…"
            : matchCount !== null
              ? `יתאים ל־${matchCount} עסקאות`
              : null}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <button
        type="button"
        disabled={saving || !trimmed || zeroMatches || previewPending}
        onClick={() => void handleCreateRule()}
        className="min-h-9 w-full rounded-lg bg-brand-blue-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? "שומר…" : buttonLabel}
      </button>
      {zeroMatches ? (
        <p className="text-[11px] text-text-muted">אין עסקאות שמתאימות לתבנית זו</p>
      ) : null}
    </section>
  );
}

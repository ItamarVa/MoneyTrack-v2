"use client";

/**
 * "Suggested budgets" block of the settings budgets panel: per-category averages of the last
 * 3 full months with a checkbox and an editable amount, activated in one click via the
 * existing create-budget API. Categories that already have a budget for the shown month are
 * hidden. Used by: budget-panel.tsx.
 */
import type { BudgetSuggestion } from "@moneytrack/engine";
import { useEffect, useMemo, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { useToast } from "@/components/ui/toast";
import { createBudget } from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { fetchBudgetSuggestions } from "./budget-api";

type Props = {
  period: string;
  /** Categories that already have a budget in `period`. */
  budgetedCategoryIds: ReadonlySet<string>;
  onActivated: () => Promise<void>;
};

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function BudgetSuggestionsSection({ period, budgetedCategoryIds, onActivated }: Props) {
  const { showToast } = useToast();
  const text = he.budgetsUx.suggestions;
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBudgetSuggestions()
      .then((rows) => {
        if (cancelled) return;
        setSuggestions(rows);
        setAmounts(Object.fromEntries(rows.map((row) => [row.categoryId, String(row.suggestedIls)])));
      })
      .catch(() => {
        if (!cancelled) showToast(text.loadError, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [showToast, text.loadError]);

  const visible = useMemo(
    () => suggestions.filter((row) => !budgetedCategoryIds.has(row.categoryId)),
    [suggestions, budgetedCategoryIds],
  );
  const selected = visible.filter(
    (row) => !unchecked.has(row.categoryId) && parseAmount(amounts[row.categoryId] ?? "") !== null,
  );

  if (visible.length === 0) return null;

  function toggle(categoryId: string) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (!next.delete(categoryId)) next.add(categoryId);
      return next;
    });
  }

  async function activate() {
    setBusy(true);
    const results = await Promise.allSettled(
      selected.map((row) =>
        createBudget({
          categoryId: row.categoryId,
          period,
          amount: parseAmount(amounts[row.categoryId] ?? "")!,
        }),
      ),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const done = results.length - failed;
    showToast(
      failed === 0
        ? fillTemplate(text.activated, { count: done })
        : fillTemplate(text.partial, { done, failed }),
      failed === 0 ? "success" : "error",
    );
    try {
      await onActivated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border-subtle bg-surface-elevated p-3">
      <h3 className="font-display text-base text-text-primary">{text.title}</h3>
      <p className="mt-1 text-xs text-text-muted">{text.hint}</p>

      <ul className="mt-3 divide-y divide-border-subtle">
        {visible.map((row) => {
          const checked = !unchecked.has(row.categoryId);
          return (
            <li key={row.categoryId} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(row.categoryId)}
                aria-label={fillTemplate(text.include, { category: row.categoryName })}
                className="size-5 shrink-0 accent-brand-blue-500"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{row.categoryName}</p>
                <p className="text-xs text-text-muted">
                  {fillTemplate(text.average, { amount: formatIls(Math.round(row.averageIls)) })}
                </p>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={amounts[row.categoryId] ?? ""}
                disabled={!checked}
                onChange={(e) =>
                  setAmounts((current) => ({ ...current, [row.categoryId]: e.target.value }))
                }
                aria-label={fillTemplate(text.amountLabel, { category: row.categoryName })}
                className="min-h-11 w-24 shrink-0 rounded-lg border border-border-subtle bg-surface-bg px-2 text-sm disabled:opacity-50"
              />
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={busy || selected.length === 0}
        onClick={() => void activate()}
        className="mt-3 min-h-11 w-full rounded-lg bg-brand-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {busy ? text.activating : text.activate}
      </button>
    </div>
  );
}

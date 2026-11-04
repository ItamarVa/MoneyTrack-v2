"use client";

/**
 * Quick classify: uncategorized purchases grouped by merchant, one card at a time. A chip or the
 * chooser creates the merchant rule (same call as /classify) and the card advances; a banner offers
 * undo, which deletes that rule and re-runs the reapply job.
 * Gotcha: the list is fixed at load; skip and classify both just move the cursor, so "N of M" is stable.
 */
import type { Category, UncategorizedMerchant } from "@moneytrack/contracts";
import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import { CheckCircle2, Tags } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createMerchantRule } from "@/components/attention/attention-api";
import {
  providerCategoryIds,
  rootCategoryIds,
  suggestCategoryIds,
  topUsedCategoryIds,
  type BreakdownRow,
  type ProviderMapRow,
} from "@/components/attention/attention-logic";
import { CategoryChooser } from "@/components/category/category-chooser";
import { fillTemplate } from "@/components/category/category-options";
import { Icon } from "@/components/ui/icon";
import {
  deleteRule,
  fetchBreakdown,
  fetchCategories,
  fetchProviderCategoryMap,
  fetchTransactions,
  reclassifyAll,
} from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import he from "@/locales/he.json";

const copy = he.attention.classify;
const EXCLUDE_UNCATEGORIZED: readonly string[] = [UNCATEGORIZED_CATEGORY_ID];
const chipClass =
  "min-h-12 rounded-xl border border-border-subtle bg-surface-bg px-4 text-base font-medium text-text-primary transition active:bg-surface-elevated disabled:opacity-60";

type Done = { ruleId: string; index: number; text: string };

function countLabel(count: number): string {
  return count === 1 ? copy.transactionOne : fillTemplate(copy.transactions, { count });
}

/** Everything the chips need; each source is optional so a failed one only removes suggestions. */
function useSuggestionSources() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [providerMap, setProviderMap] = useState<ProviderMapRow[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  // Chips wait for all three so they never flash in a half-ordered state; a failed source counts as loaded.
  const [pending, setPending] = useState(3);
  useEffect(() => {
    const settle = () => setPending((n) => n - 1);
    void fetchCategories().then(setCategories, () => undefined).then(settle);
    void fetchProviderCategoryMap().then(setProviderMap, () => undefined).then(settle);
    void fetchBreakdown({ dateBasis: DEFAULT_DATE_BASIS }, "category", "expense")
      .then((res) => setBreakdown(res.items), () => undefined)
      .then(settle);
  }, []);
  return { categories, providerMap, breakdown, loading: pending > 0 };
}

/** Date of the merchant's newest transaction; stays null when it cannot be read. */
function useLastDate(merchantId: string | undefined): string | null {
  const [state, setState] = useState<{ id: string; date: string } | null>(null);
  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    void fetchTransactions({ merchantIds: [merchantId] }, 1).then(
      (rows) => {
        const date = rows[0]?.transactionDate;
        if (!cancelled && date) setState({ id: merchantId, date });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [merchantId]);
  return state && state.id === merchantId ? state.date : null;
}

export function ClassifyBlock({ merchants }: { merchants: UncategorizedMerchant[] }) {
  const { categories, providerMap, breakdown, loading } = useSuggestionSources();
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const merchant = merchants[cursor];
  const lastDate = useLastDate(merchant?.merchantId);
  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const topUsed = useMemo(() => topUsedCategoryIds(breakdown), [breakdown]);
  const rootIds = useMemo(() => rootCategoryIds(categories), [categories]);
  const suggestions = useMemo(
    () =>
      merchant
        ? suggestCategoryIds({
            providerIds: providerCategoryIds(merchant, providerMap),
            topUsedIds: topUsed,
            fallbackIds: rootIds,
            knownIds: new Set(nameById.keys()),
          })
        : [],
    [merchant, providerMap, topUsed, rootIds, nameById],
  );

  const choose = useCallback(
    async (categoryId: string) => {
      if (!merchant) return;
      setChooserOpen(false);
      setSaving(true);
      setMessage(null);
      try {
        const ruleId = await createMerchantRule(merchant.merchantName, categoryId);
        if (!ruleId) {
          setMessage(copy.noPattern);
          return;
        }
        setDone({
          ruleId,
          index: cursor,
          text: fillTemplate(copy.confirmed, {
            count: countLabel(merchant.transactionCount),
            merchant: merchant.merchantName,
            category: nameById.get(categoryId) ?? "",
          }),
        });
        setCursor((value) => value + 1);
      } catch {
        setMessage(copy.saveError);
      } finally {
        setSaving(false);
      }
    },
    [merchant, cursor, nameById],
  );

  async function undo(): Promise<void> {
    if (!done) return;
    setSaving(true);
    try {
      await deleteRule(done.ruleId);
      await reclassifyAll();
      setCursor(done.index);
      setDone(null);
      setMessage(copy.undone);
    } catch {
      setMessage(copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (merchants.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-classify-title"
      className="space-y-4 rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <h2
        id="attention-classify-title"
        className="flex items-center gap-2 font-display text-lg text-text-primary"
      >
        <Icon icon={Tags} size={18} className="text-brand-blue-500" />
        {copy.title}
      </h2>

      {done || message ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg bg-brand-blue-500/10 px-3 py-2 text-sm text-text-primary"
        >
          <span>{done ? done.text : message}</span>
          {done ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void undo()}
              className="min-h-11 shrink-0 px-2 font-semibold text-brand-blue-500 disabled:opacity-60"
            >
              {copy.undo}
            </button>
          ) : null}
        </div>
      ) : null}

      {merchant ? (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            {fillTemplate(copy.progress, { current: cursor + 1, total: merchants.length })}
          </p>
          <div className="space-y-1">
            <p className="break-words text-xl font-semibold text-text-primary">{merchant.merchantName}</p>
            <p className="text-sm text-text-secondary">
              {countLabel(merchant.transactionCount)} ·{" "}
              {fillTemplate(copy.total, { amount: formatIls(merchant.totalAmountIls) })}
              {lastDate ? ` · ${fillTemplate(copy.lastDate, { date: formatShortDate(lastDate) })}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {loading
              ? [0, 1, 2, 3].map((n) => (
                  <div key={n} aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-surface-elevated" />
                ))
              : suggestions.map((id) => (
              <button
                key={id}
                type="button"
                disabled={saving}
                onClick={() => void choose(id)}
                className={chipClass}
              >
                {nameById.get(id)}
              </button>
            ))}
            <button
              type="button"
              disabled={saving}
              onClick={() => setChooserOpen(true)}
              className={`${chipClass} col-span-2 border-brand-blue-500/40 text-brand-blue-500`}
            >
              {copy.other}
            </button>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setCursor((value) => value + 1)}
            className="min-h-11 w-full text-sm font-medium text-text-muted disabled:opacity-60"
          >
            {saving ? copy.saving : copy.skip}
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Icon icon={CheckCircle2} size={18} className="text-brand-blue-500" />
          {copy.finished}
        </p>
      )}

      <CategoryChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        categories={categories}
        value={null}
        onSelect={(id) => void choose(id)}
        excludeIds={EXCLUDE_UNCATEGORIZED}
        title={copy.chooserTitle}
      />
    </section>
  );
}

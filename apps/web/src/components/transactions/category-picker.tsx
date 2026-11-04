"use client";

/**
 * Category control for one transaction: a button showing the current category that opens the
 * shared chooser. A pick saves manually (PATCH), "back to automatic" clears the manual lock
 * (DELETE), and after a pick the user is offered a merchant rule for similar transactions.
 * variant "chip" is the phone-card form (44px, pill); "field" is the table/drawer form.
 * Used by: transaction-table (desktop cell and mobile card), transaction-detail-drawer.
 */
import type { Category, Transaction } from "@moneytrack/contracts";
import { Tag } from "lucide-react";
import { useState } from "react";
import { clearTransactionCategory } from "@/components/category/category-api";
import { CategoryChooser } from "@/components/category/category-chooser";
import { categoryPathLabel, fillTemplate } from "@/components/category/category-options";
import {
  MerchantRuleOffer,
  type MerchantRuleOfferData,
} from "@/components/transactions/merchant-rule-offer";
import { Icon } from "@/components/ui/icon";
import { previewRuleMatches, setTransactionCategory } from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";
import { suggestMerchantPattern } from "@/lib/merchant-pattern";
import he from "@/locales/he.json";

const copy = he.categoryChooser;
const EXCLUDED_FROM_PICKING = [UNCATEGORIZED_CATEGORY_ID];

type CategoryPickerProps = {
  transactionId: string;
  value: string | null;
  classificationSource: string | null;
  categories: Category[];
  /** Receives the updated row so the list can patch it without reloading. */
  onChanged: (updated: Transaction) => void;
  variant?: "field" | "chip";
};

export function CategoryPicker({
  transactionId,
  value,
  classificationSource,
  categories,
  onChanged,
  variant = "field",
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<MerchantRuleOfferData | null>(null);

  const isManual = classificationSource === "manual";
  const badge = isManual ? copy.manualBadge : classificationSource ? copy.autoBadge : null;
  const label = categoryPathLabel(categories, value);

  async function loadOffer(updated: Transaction, categoryId: string): Promise<void> {
    const pattern = suggestMerchantPattern(updated.descriptionNormalized);
    if (!pattern) return;
    try {
      const matchCount = await previewRuleMatches(pattern);
      // One match is the row just changed; nothing else to apply to.
      if (matchCount < 2) return;
      const categoryName = categories.find((row) => row.id === categoryId)?.name ?? "";
      setOffer({ pattern, categoryId, categoryName, matchCount });
    } catch {
      // The offer is a convenience; the pick itself already succeeded.
    }
  }

  async function pick(categoryId: string): Promise<void> {
    setOpen(false);
    if (categoryId === value && isManual) return;
    setPending(true);
    setError(null);
    setOffer(null);
    try {
      const updated = await setTransactionCategory(transactionId, categoryId);
      onChanged(updated);
      void loadOffer(updated, categoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.saveFailed);
    } finally {
      setPending(false);
    }
  }

  async function backToAutomatic(): Promise<void> {
    setOpen(false);
    setPending(true);
    setError(null);
    setOffer(null);
    try {
      onChanged(await clearTransactionCategory(transactionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.resetFailed);
    } finally {
      setPending(false);
    }
  }

  const chip = variant === "chip";
  const triggerClass = chip
    ? "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-surface-elevated px-3 text-xs font-medium text-text-primary disabled:opacity-60"
    : "flex min-h-11 max-w-full items-center rounded-md border border-border-strong bg-surface-card px-2 text-start text-xs text-text-primary disabled:opacity-60 md:min-h-8";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={fillTemplate(copy.changeAria, { current: label ?? copy.placeholder })}
        onClick={() => setOpen(true)}
        className={triggerClass}
      >
        {chip ? <Icon icon={Tag} size={14} className="shrink-0 text-text-muted" /> : null}
        <span className={["min-w-0 truncate", label ? "" : "text-brand-orange-500"].join(" ")}>
          {pending ? copy.saving : (label ?? copy.placeholder)}
        </span>
      </button>
      {badge ? (
        <span className="shrink-0 rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] text-text-secondary">
          {badge}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="w-full text-xs text-brand-orange-500">
          {error}
        </span>
      ) : null}
      <CategoryChooser
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        value={value}
        excludeIds={EXCLUDED_FROM_PICKING}
        onSelect={(categoryId) => void pick(categoryId)}
        resetAction={
          isManual
            ? {
                label: copy.backToAutomatic,
                hint: copy.backToAutomaticHint,
                onClick: () => void backToAutomatic(),
              }
            : undefined
        }
      />
      {offer ? <MerchantRuleOffer {...offer} onDismiss={() => setOffer(null)} /> : null}
    </div>
  );
}

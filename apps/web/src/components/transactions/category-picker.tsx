"use client";

/**
 * Category control for one transaction: a button showing the current category that opens the
 * shared chooser. A pick saves manually (PATCH), "back to automatic" clears the manual lock
 * (DELETE), and after a pick the user is offered a merchant rule for similar transactions.
 * variant "chip" is the phone-card form (44px, pill); "field" is the table/drawer form.
 * Used by: transaction-table (desktop cell and mobile card), transaction-detail-drawer.
 */
import type { Category, Transaction } from "@moneytrack/contracts";
import { ChevronDown, Tag } from "lucide-react";
import { useEffect, useState } from "react";
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
const formCopy = he.drawer.category;
const EXCLUDED_FROM_PICKING = [UNCATEGORIZED_CATEGORY_ID];

type CategoryPickerProps = {
  transactionId: string;
  value: string | null;
  classificationSource: string | null;
  categories: Category[];
  /** Receives the updated row so the list can patch it without reloading. */
  onChanged: (updated: Transaction) => void;
  /** "form" is the drawer form: label, full-width field-style button, plain automatic/manual sentence. */
  variant?: "field" | "chip" | "form";
/** Table-row form: single line, automatic/manual shown as a dot with a tooltip instead of a pill. */
compact?: boolean;
  /** Fires when the merchant-rule banner appears or goes away, so a caller can avoid a duplicate offer. */
  onOfferChange?: (visible: boolean) => void;
};

export function CategoryPicker({
  transactionId,
  value,
  classificationSource,
  categories,
  onChanged,
  variant = "field",
compact = false,
  onOfferChange,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<MerchantRuleOfferData | null>(null);

  useEffect(() => {
    onOfferChange?.(offer !== null);
  }, [offer, onOfferChange]);

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

  if (variant === "form") {
    const hasValue = Boolean(label);
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={pending}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={
            hasValue
              ? fillTemplate(formCopy.fieldAria, { current: label ?? "" })
              : formCopy.fieldAriaEmpty
          }
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border-strong bg-surface-card px-3 text-start text-sm text-text-primary transition-colors hover:border-brand-blue-500 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500 disabled:opacity-60"
        >
          <Icon icon={Tag} size={16} className="shrink-0 text-text-muted" />
          <span
            className={[
              "min-w-0 flex-1 truncate",
              hasValue ? "font-medium" : "text-brand-orange-500",
            ].join(" ")}
          >
            {pending ? copy.saving : (label ?? formCopy.choose)}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-blue-500">
            {hasValue ? formCopy.change : null}
            <Icon icon={ChevronDown} size={16} />
          </span>
        </button>
        {hasValue ? (
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-text-secondary">
            {isManual ? formCopy.manualSentence : classificationSource ? formCopy.autoSentence : null}
            {isManual ? (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void backToAutomatic()}
                  className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-brand-blue-500 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500 disabled:opacity-60"
                >
                  {formCopy.backToAuto}
                </button>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-text-muted">{formCopy.uncategorizedHint}</p>
        )}
        {error ? (
          <p role="alert" className="text-xs text-brand-orange-500">
            {error}
          </p>
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

  const chip = variant === "chip";
  const triggerClass = chip
    ? "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-surface-elevated px-3 text-xs font-medium text-text-primary disabled:opacity-60"
    : "flex min-h-11 min-w-0 max-w-full items-center rounded-md border border-border-strong bg-surface-card px-2 text-start text-xs text-text-primary disabled:opacity-60 md:min-h-8";

  return (
    <div className={["flex min-w-0 items-center", compact ? "flex-nowrap gap-1.5" : "flex-wrap gap-2"].join(" ")}>
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
      {badge && compact ? (
  <span
    role="img"
    title={badge}
    aria-label={badge}
    className={["h-2 w-2 shrink-0 rounded-full", isManual ? "bg-brand-blue-500" : "bg-text-muted"].join(" ")}
  />
) : badge ? (
  <span className="shrink-0 rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] text-text-secondary">
    {badge}
  </span>
) : null}
      {error ? (
        <span role="alert" className={["text-xs text-brand-orange-500", compact ? "truncate" : "w-full"].join(" ")} title={error}>
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

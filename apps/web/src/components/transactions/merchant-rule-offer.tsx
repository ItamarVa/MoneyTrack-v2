"use client";

/**
 * Dismissable offer shown after a manual category pick: "apply to all N transactions of this
 * merchant and future ones?". Never automatic: the rule is created only on the confirm button,
 * through the same createMerchantRule helper the drawer block uses (the rules route queues the
 * background reapply). A bottom banner in a portal, not inline: table rows are virtualised and
 * would clip or resize around it, and on a phone the bottom is where the thumb is.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { fillTemplate } from "@/components/category/category-options";
import { createMerchantRule } from "@/components/transactions/merchant-rule-block";
import { useToast } from "@/components/ui/toast";
import he from "@/locales/he.json";

const copy = he.categoryChooser;
const ruleCopy = he.drawer.rule;

export type MerchantRuleOfferData = {
  pattern: string;
  categoryId: string;
  categoryName: string;
  matchCount: number;
};

type MerchantRuleOfferProps = MerchantRuleOfferData & { onDismiss: () => void };

export function MerchantRuleOffer({
  pattern,
  categoryId,
  categoryName,
  matchCount,
  onDismiss,
}: MerchantRuleOfferProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  if (typeof document === "undefined") return null;

  async function apply(): Promise<void> {
    setSaving(true);
    try {
      await createMerchantRule(pattern, categoryId);
      showToast(copy.ruleDone, "success");
      onDismiss();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.ruleFailed, "error");
      setSaving(false);
    }
  }

  return createPortal(
    <section
      aria-label={ruleCopy.title}
      aria-live="polite"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
      }}
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[90] mx-auto max-w-md rounded-card border border-border-strong bg-surface-card p-4 text-text-primary shadow-xl lg:bottom-6"
    >
      <p className="text-sm font-semibold">{ruleCopy.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-text-secondary">
        {fillTemplate(ruleCopy.body, { merchant: pattern })}
        {categoryName ? ` (${categoryName})` : ""}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={saving}
          onClick={() => void apply()}
          className="min-h-11 flex-1 rounded-lg bg-brand-blue-500 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {saving ? ruleCopy.saving : fillTemplate(ruleCopy.applyWithCount, { count: matchCount })}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onDismiss}
          className="min-h-11 flex-1 rounded-lg border border-border-strong px-3 text-sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500 disabled:opacity-60"
        >
          {ruleCopy.dismiss}
        </button>
      </div>
    </section>,
    document.body,
  );
}

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
      aria-label={copy.ruleOfferTitle}
      aria-live="polite"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
      }}
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[90] mx-auto max-w-md rounded-card border border-border-strong bg-surface-card p-4 text-text-primary shadow-xl lg:bottom-6"
    >
      <p className="text-sm leading-relaxed">
        {fillTemplate(copy.ruleOfferQuestion, {
          category: categoryName,
          count: matchCount,
          merchant: pattern,
        })}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={saving}
          onClick={() => void apply()}
          className="min-h-11 flex-1 rounded-lg bg-brand-blue-500 px-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? copy.ruleApplying : copy.ruleApply}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onDismiss}
          className="min-h-11 flex-1 rounded-lg border border-border-strong px-3 text-sm font-medium text-text-secondary disabled:opacity-60"
        >
          {copy.ruleDismiss}
        </button>
      </div>
    </section>,
    document.body,
  );
}

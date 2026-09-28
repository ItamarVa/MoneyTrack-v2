"use client";

/**
 * Classify page: uncategorized merchant rules, MAX provider mapping, and full reapply.
 * Background job progress is shown via BackgroundWorkChip in the app shell header.
 */
import { useState } from "react";
import { ProviderCategoryMapSection } from "@/components/classify/provider-category-map-section";
import { UncategorizedMerchantsSection } from "@/components/classify/uncategorized-merchants-section";
import { useToast } from "@/components/ui/toast";
import { reclassifyAll } from "@/lib/api-client";

export function ClassifyPageClient() {
  const { showToast } = useToast();
  const [reapplying, setReapplying] = useState(false);

  async function handleReapplyAll(): Promise<void> {
    setReapplying(true);
    try {
      await reclassifyAll();
      showToast("סיווג מחדש התחיל — עקוב אחר ההתקדמות בראש הדף", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "סיווג מחדש נכשל", "error");
    } finally {
      setReapplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          סיווג אוטומטי לפי קטגוריות MAX וכללי ספקים
        </p>
        <button
          type="button"
          disabled={reapplying}
          onClick={() => void handleReapplyAll()}
          className="min-h-10 rounded-lg bg-brand-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {reapplying ? "מפעיל…" : "סווג מחדש הכל"}
        </button>
      </div>

      <UncategorizedMerchantsSection />

      <ProviderCategoryMapSection />
    </div>
  );
}

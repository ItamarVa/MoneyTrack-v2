"use client";

/**
 * Classify page: only the merchants that still have no category, plus a link to quick sorting.
 * Expert tools (provider category map, reclassify all) live in Settings > Advanced.
 */
import Link from "next/link";
import { UncategorizedMerchantsSection } from "@/components/classify/uncategorized-merchants-section";
import he from "@/locales/he.json";

const copy = he.plainUx.classify;

export function ClassifyPageClient() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-text-primary sm:text-3xl">{copy.title}</h1>
        <Link
          href="/attention"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white"
        >
          {copy.quickLink}
        </Link>
      </div>

      <UncategorizedMerchantsSection />
    </div>
  );
}

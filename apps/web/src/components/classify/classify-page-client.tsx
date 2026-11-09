"use client";

/**
 * Classification hub: one sticky tab bar for everything about classifying money (uncategorized
 * merchants, rules, categories, credit-company map). ?tab=<id> deep links; the bar sticks under
 * the app header, whose height varies on phones, so the offset is measured at runtime
 * (same pattern as settings-page-client.tsx). Quick classify itself lives in /attention.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CategoriesPanel } from "@/components/classify/categories-panel";
import { CLASSIFY_TABS, parseClassifyTab, type ClassifyTabId } from "@/components/classify/classify-tabs";
import { ProviderCategoryMapSection } from "@/components/classify/provider-category-map-section";
import { RulesPanel } from "@/components/classify/rules-panel";
import { UncategorizedMerchantsSection } from "@/components/classify/uncategorized-merchants-section";
import he from "@/locales/he.json";

function TabPanel({ tabId }: { tabId: ClassifyTabId }) {
  switch (tabId) {
    case "merchants":
      return <UncategorizedMerchantsSection />;
    case "rules":
      return <RulesPanel />;
    case "categories":
      return <CategoriesPanel />;
    case "providerMap":
      return <ProviderCategoryMapSection />;
  }
}

export function ClassifyPageClient() {
  const [activeTab, setActiveTab] = useState<ClassifyTabId>("merchants");
  const [stickyTop, setStickyTop] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const linkedTab = parseClassifyTab(useSearchParams().get("tab"));

  useEffect(() => {
    if (linkedTab) setActiveTab(linkedTab);
  }, [linkedTab]);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => setStickyTop(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeTab]);

  const active = CLASSIFY_TABS.find((tab) => tab.id === activeTab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-text-primary sm:text-3xl">{he.classifyHub.title}</h1>
        <Link
          href="/attention"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white"
        >
          {he.classifyHub.quickLink}
        </Link>
      </div>

      <div
        ref={barRef}
        role="tablist"
        style={{ top: stickyTop }}
        className="sticky z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border-subtle bg-surface-bg/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
      >
        {CLASSIFY_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "min-h-11 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition",
                selected
                  ? "bg-brand-orange-500 text-white"
                  : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {active ? <p className="text-sm text-text-secondary">{active.description}</p> : null}

      <TabPanel tabId={activeTab} />
    </div>
  );
}

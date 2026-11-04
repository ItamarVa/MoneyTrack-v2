"use client";

/**
 * Settings > Advanced: expert tools kept off the main screens (rules, credit-company category
 * map, file export, reclassify all). Each is a collapsed section so the page stays calm on a phone.
 * The provider map and rules panels are the same components that used to sit on /classify and
 * the old rules tab.
 */
import type { ReactNode } from "react";
import { ProviderCategoryMapSection } from "@/components/classify/provider-category-map-section";
import { ReapplyAllSection } from "@/components/classify/reapply-all-section";
import { RulesPanel } from "@/components/settings/rules-panel";
import { apiUrl } from "@/lib/base-path";
import he from "@/locales/he.json";

const copy = he.plainUx.settings;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-card border border-border-subtle bg-surface-card shadow-sm">
      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center px-4 py-3">
        <span className="font-medium text-text-primary">{title}</span>
        <span className="text-xs text-text-muted">{description}</span>
      </summary>
      <div className="border-t border-border-subtle p-4">{children}</div>
    </details>
  );
}

export function AdvancedPanel() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{copy.advancedHint}</p>

      <Section title={copy.rules.title} description={copy.rules.description}>
        <RulesPanel />
      </Section>

      <Section title={copy.providerMap.title} description={copy.providerMap.description}>
        <ProviderCategoryMapSection />
      </Section>

      <Section title={copy.export.title} description={copy.export.description}>
        <a
          href={apiUrl("/api/analysis/export")}
          className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle bg-surface-elevated px-4 text-sm font-medium text-text-primary"
        >
          {copy.export.button}
        </a>
      </Section>

      <Section title={copy.reapply.title} description={copy.reapply.description}>
        <ReapplyAllSection />
      </Section>
    </div>
  );
}

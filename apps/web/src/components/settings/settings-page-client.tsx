"use client";

/**
 * Settings tab shell: one sticky, horizontally scrollable grouped tab bar (phone and desktop),
 * a one-line description per tab, ?tab=<id> deep links. The bar sticks under the app header,
 * whose height varies (it wraps on phones), so the offset is measured at runtime.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BudgetPanel } from "@/components/budgets/budget-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { AdvancedPanel } from "@/components/settings/advanced-panel";
import { CardsPanel } from "@/components/settings/cards-panel";
import { ConnectionsPanel } from "@/components/settings/connections-panel";
import { HaImportPanel } from "@/components/settings/ha-import-panel";
import { PeoplePanel } from "@/components/settings/people-panel";
import { SalariesPanel } from "@/components/settings/salaries-panel";
import { classifyRedirectTab, parseSettingsTab, SETTINGS_GROUPS, SETTINGS_TABS, type SettingsTabId } from "./settings-tabs";
import he from "@/locales/he.json";

type TabId = SettingsTabId;

function EmptySlot({ title }: { title: string }) {
  return (
    <div className="rounded-card border border-dashed border-border-subtle bg-surface-card/50 px-6 py-10 text-center">
      <p className="font-medium text-text-primary">{title}</p>
      <p className="mt-2 text-sm text-text-muted">{he.settingsShell.comingSoon}</p>
    </div>
  );
}

function SettingsPanel({ tabId }: { tabId: TabId }) {
  switch (tabId) {
    case "advanced":
      return <AdvancedPanel />;
    case "people":
      return <PeoplePanel />;
    case "salaries":
      return <SalariesPanel />;
    case "cards":
      return <CardsPanel />;
    case "budgets":
      return <BudgetPanel />;
    case "connections":
      return <ConnectionsPanel />;
    case "security":
      return <SecurityPanel />;
    case "backup":
      return (
        <div className="space-y-4">
          <HaImportPanel />
          <EmptySlot title={he.settingsShell.tabs.backup.label} />
        </div>
      );
    case "appearance":
      return <EmptySlot title={he.settingsShell.tabs.appearance.label} />;
    default:
      return null;
  }
}

export function SettingsPageClient() {
  // useSearchParams needs a Suspense boundary and page.tsx has none.
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const [activeTab, setActiveTab] = useState<TabId>("people");
  const [stickyTop, setStickyTop] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const tabParam = useSearchParams().get("tab");
  const linkedTab = parseSettingsTab(tabParam);
  const classifyTab = classifyRedirectTab(tabParam);

  // Old /settings?tab=rules|categories links now live in the classification hub.
  useEffect(() => {
    if (classifyTab) router.replace(`/classify?tab=${classifyTab}`);
  }, [classifyTab, router]);

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

  // Keep the active tab visible inside the scrollable bar.
  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeTab]);

  const active = SETTINGS_TABS.find((tab) => tab.id === activeTab);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-text-primary">{he.settingsShell.title}</h1>

      <div
        ref={barRef}
        role="tablist"
        style={{ top: stickyTop }}
        className="sticky z-20 -mx-4 flex items-end gap-4 overflow-x-auto border-b border-border-subtle bg-surface-bg/95 px-4 pb-2 pt-2 backdrop-blur-md sm:-mx-6 sm:px-6"
      >
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.id} className="flex shrink-0 flex-col gap-1">
            <span className="px-1 text-xs text-text-muted">
              {he.settingsShell.groups[group.id]}
            </span>
            <div className="flex gap-1">
              {group.tabs.map((id) => {
                const tab = SETTINGS_TABS.find((t) => t.id === id);
                const selected = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(id)}
                    className={[
                      "min-h-11 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition",
                      selected
                        ? "bg-brand-orange-500 text-white"
                        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                    ].join(" ")}
                  >
                    {tab?.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {active ? <p className="text-sm text-text-secondary">{active.description}</p> : null}

      <SettingsPanel tabId={activeTab} />
    </div>
  );
}

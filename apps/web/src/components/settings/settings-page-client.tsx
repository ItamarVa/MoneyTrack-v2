"use client";

/**
 * Settings tab shell: horizontal tabs on md+, list-then-detail on narrow viewports (Track E3).
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { BudgetPanel } from "@/components/budgets/budget-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { CategoriesPanel } from "@/components/settings/categories-panel";
import { RulesPanel } from "@/components/settings/rules-panel";
import { CardsPanel } from "@/components/settings/cards-panel";
import { HaImportPanel } from "@/components/settings/ha-import-panel";
import { PeoplePanel } from "@/components/settings/people-panel";
import { SalariesPanel } from "@/components/settings/salaries-panel";
import { MobileCardList, MobileCardListItem } from "@/components/mobile";
import { Icon } from "@/components/ui/icon";

const tabs = [
  { id: "categories", label: "קטגוריות" },
  { id: "rules", label: "כללים" },
  { id: "people", label: "בני משפחה" },
  { id: "salaries", label: "משכורות" },
  { id: "cards", label: "כרטיסים" },
  { id: "budgets", label: "תקציבים" },
  { id: "security", label: "אבטחה" },
  { id: "backup", label: "גיבוי" },
  { id: "appearance", label: "תצוגה" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function EmptySlot({ title }: { title: string }) {
  return (
    <div className="rounded-card border border-dashed border-border-subtle bg-surface-card/50 px-6 py-10 text-center">
      <p className="font-medium text-text-primary">{title}</p>
      <p className="mt-2 text-sm text-text-muted">יושלם בשלב הבא.</p>
    </div>
  );
}

function SettingsPanel({ tabId }: { tabId: TabId }) {
  switch (tabId) {
    case "categories":
      return <CategoriesPanel />;
    case "rules":
      return <RulesPanel />;
    case "people":
      return <PeoplePanel />;
    case "salaries":
      return <SalariesPanel />;
    case "cards":
      return <CardsPanel />;
    case "budgets":
      return <BudgetPanel />;
    case "security":
      return <SecurityPanel />;
    case "backup":
      return (
        <div className="space-y-4">
          <HaImportPanel />
          <EmptySlot title="גיבוי ושחזור" />
        </div>
      );
    case "appearance":
      return <EmptySlot title="תצוגה וערכת נושא" />;
    default:
      return null;
  }
}

export function SettingsPageClient() {
  const [activeTab, setActiveTab] = useState<TabId>("categories");
  const [mobileDetail, setMobileDetail] = useState(false);

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "";

  function openMobileTab(tabId: TabId) {
    setActiveTab(tabId);
    setMobileDetail(true);
  }

  return (
    <div className="space-y-6">
      {mobileDetail ? (
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileDetail(false)}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-text-secondary"
            aria-label="חזרה לרשימת הגדרות"
          >
            <Icon icon={ChevronRight} size={20} />
          </button>
          <h1 className="font-display text-2xl text-text-primary">{activeLabel}</h1>
        </div>
      ) : (
        <h1 className="font-display text-3xl text-text-primary">הגדרות</h1>
      )}

      <div className="hidden flex-wrap gap-2 border-b border-border-subtle pb-3 md:flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "min-h-11 rounded-lg px-4 text-sm font-medium transition",
              activeTab === tab.id
                ? "bg-brand-orange-500 text-white"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={mobileDetail ? "hidden" : "md:hidden"}>
        <MobileCardList>
          {tabs.map((tab) => (
            <MobileCardListItem key={tab.id} onClick={() => openMobileTab(tab.id)}>
              <span className="text-sm font-medium text-text-primary">{tab.label}</span>
            </MobileCardListItem>
          ))}
        </MobileCardList>
      </div>

      <div className={mobileDetail ? "block" : "hidden md:block"}>
        <SettingsPanel tabId={activeTab} />
      </div>
    </div>
  );
}

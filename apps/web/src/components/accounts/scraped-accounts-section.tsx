"use client";

/**
 * Synced bank accounts and credit cards as AccountCards, split into household and business.
 * Moving an account to `business` keeps it out of every household total; the engine reads
 * `accounts.scope` (MEM-DATA). Connection management lives under Settings, not here.
 */
import type { Account, Person } from "@moneytrack/contracts";
import { AccountCard, type AccountPatch, type SummaryState } from "@/components/accounts/account-card";
import he from "@/locales/he.json";

export type AccountsSectionProps = {
  accounts: Account[];
  people: readonly Person[];
  summaries: Record<string, SummaryState>;
  wholeWindow: boolean;
  busyId: string | null;
  onUpdate: (account: Account, patch: AccountPatch) => Promise<boolean>;
};

const gridClass = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

export function ScrapedAccountsSection({
  accounts,
  people,
  summaries,
  wholeWindow,
  busyId,
  onUpdate,
}: AccountsSectionProps) {
  const scraped = accounts.filter((a) => a.kind !== "cash");
  const household = scraped.filter((a) => a.scope !== "business");
  const business = scraped.filter((a) => a.scope === "business");

  if (scraped.length === 0) {
    return null;
  }

  const renderCard = (account: Account) => (
    <AccountCard
      key={account.id}
      account={account}
      people={people}
      state={summaries[account.id] ?? { status: "loading" }}
      wholeWindow={wholeWindow}
      busy={busyId === account.id}
      onUpdate={onUpdate}
    />
  );

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-text-primary">{he.accounts.synced}</h2>
      <ul className={gridClass}>{household.map(renderCard)}</ul>

      {business.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="font-display text-lg text-text-primary">{he.accounts.business}</h3>
            <p className="text-sm text-text-secondary">{he.accounts.businessHint}</p>
          </div>
          <ul className={gridClass}>{business.map(renderCard)}</ul>
        </div>
      ) : null}
    </section>
  );
}

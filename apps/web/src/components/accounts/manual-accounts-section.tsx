"use client";

/**
 * Manual cash accounts (Bit, Paybox, cash) as AccountCards. Adding lives in AddAccountForm.
 */
import { AccountCard } from "@/components/accounts/account-card";
import type { AccountsSectionProps } from "@/components/accounts/scraped-accounts-section";
import { EmptyState } from "@/components/empty-state";
import he from "@/locales/he.json";

export function ManualAccountsSection({
  accounts,
  people,
  summaries,
  wholeWindow,
  busyId,
  onUpdate,
}: AccountsSectionProps) {
  const manualAccounts = accounts.filter((a) => a.kind === "cash");

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-text-primary">{he.accounts.manual}</h2>

      {manualAccounts.length === 0 ? (
        <EmptyState title={he.accounts.emptyManualTitle} description={he.accounts.emptyManualDescription} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {manualAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              people={people}
              state={summaries[account.id] ?? { status: "loading" }}
              wholeWindow={wholeWindow}
              busy={busyId === account.id}
              onUpdate={onUpdate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

/**
 * Manual cash accounts (Bit, Paybox, cash) list. Adding lives in AddAccountForm.
 */
import type { Account } from "@moneytrack/contracts";
import { EmptyState } from "@/components/empty-state";
import { accountLabel } from "@/lib/account-label";

type ManualAccountsSectionProps = {
  accounts: Account[];
};

export function ManualAccountsSection({ accounts }: ManualAccountsSectionProps) {
  const manualAccounts = accounts.filter((a) => a.kind === "cash");

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-text-primary">חשבונות ידניים</h2>

      {manualAccounts.length === 0 ? (
        <EmptyState
          title="אין חשבונות ידניים"
          description="הוסיפו ביט, פייבוקס או מזומן דרך הוספת חשבון ידני כדי להזין עסקאות ידנית."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {manualAccounts.map((account) => (
            <li
              key={account.id}
              className="rounded-card border border-border-subtle bg-surface-card px-4 py-4 shadow-sm"
            >
              <p className="font-medium text-text-primary">{account.displayName}</p>
              <p className="mt-1 text-xs text-text-muted">
                {accountLabel({ institutionCode: account.institutionCode })} · {account.currency}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

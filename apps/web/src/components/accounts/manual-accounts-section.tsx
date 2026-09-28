"use client";

/**
 * Manual cash accounts (Bit, Paybox, cash) — quick-add buttons and list.
 */
import type { Account } from "@moneytrack/contracts";
import { Smartphone, Wallet, CreditCard } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/ui/icon";

const manualTypes = [
  { code: "bit", label: "ביט", icon: Smartphone },
  { code: "paybox", label: "פייבוקס", icon: CreditCard },
  { code: "cash", label: "מזומן", icon: Wallet },
] as const;

type ManualAccountsSectionProps = {
  accounts: Account[];
  onAddManual: (code: string, label: string) => void;
};

export function ManualAccountsSection({ accounts, onAddManual }: ManualAccountsSectionProps) {
  const manualAccounts = accounts.filter((a) => a.kind === "cash");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-text-primary">חשבונות ידניים</h2>
        <div className="flex flex-wrap gap-2">
          {manualTypes.map((type) => {
            const exists = manualAccounts.some((a) => a.institutionCode === type.code);
            return (
              <button
                key={type.code}
                type="button"
                disabled={exists}
                onClick={() => onAddManual(type.code, type.label)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle bg-surface-card px-4 text-sm font-medium transition hover:bg-surface-elevated disabled:opacity-40"
              >
                <Icon icon={type.icon} size={16} />
                {type.label}
                {exists ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {manualAccounts.length === 0 ? (
        <EmptyState
          title="אין חשבונות ידניים"
          description="הוסיפו ביט, פייבוקס או מזומן כדי להזין עסקאות ידנית."
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
                {account.institutionCode} · {account.currency}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

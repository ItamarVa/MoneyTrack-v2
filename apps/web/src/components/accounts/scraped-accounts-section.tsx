"use client";

/**
 * One card per scraped bank account or credit card, split into household and
 * business. Before this, the accounts page listed manual cash accounts only, so
 * a synced bank account and its balance appeared nowhere (owner report
 * 2026-09-14). Moving an account to `business` is what keeps it out of every
 * household total; the engine reads `accounts.scope` (MEM-DATA).
 */
import type { Account } from "@moneytrack/contracts";
import { Banknote, Briefcase, CreditCard, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { updateAccount } from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import { entityDetailUrl } from "@/lib/analysis-filter";
import { providerLabel } from "@/lib/provider-labels";

type ScrapedAccountsSectionProps = {
  accounts: Account[];
  onChanged: () => void;
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function balanceLabel(account: Account): string {
  return account.kind === "credit_card" ? "יתרה לחיוב" : "יתרה";
}

function AccountCard({
  account,
  busy,
  onToggleScope,
}: {
  account: Account;
  busy: boolean;
  onToggleScope: (account: Account) => void;
}) {
  const isBusiness = account.scope === "business";

  return (
    <li className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-text-primary">
            <Icon icon={account.kind === "credit_card" ? CreditCard : Banknote} size={16} />
            {providerLabel(account.institutionCode)}
          </p>
          {account.numberLast4 ? (
            <p className="mt-1 text-xs text-text-muted" dir="ltr">
              •••• {account.numberLast4}
            </p>
          ) : null}
        </div>
        <Link
          href={entityDetailUrl("account", account.id, currentPeriod())}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border-subtle px-3 text-sm font-medium hover:bg-surface-elevated"
        >
          <Icon icon={ExternalLink} size={14} />
          תזרים
        </Link>
      </div>

      <div>
        <p className="text-xs text-text-muted">{balanceLabel(account)}</p>
        {account.balanceIls === null ? (
          <p className="text-sm text-text-secondary">טרם סונכרן</p>
        ) : (
          <p className="font-display text-2xl text-text-primary">
            <bdi dir="ltr">{formatIls(account.balanceIls)}</bdi>
          </p>
        )}
        {account.balanceDate ? (
          <p className="mt-1 text-xs text-text-muted">נכון ל-{formatShortDate(account.balanceDate)}</p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => onToggleScope(account)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-subtle px-3 text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
      >
        <Icon icon={Briefcase} size={14} />
        {isBusiness ? "החזר לחשבונות משק הבית" : "סמן כחשבון עסקי"}
      </button>
    </li>
  );
}

export function ScrapedAccountsSection({ accounts, onChanged }: ScrapedAccountsSectionProps) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const scraped = accounts.filter((a) => a.kind !== "cash");
  const household = scraped.filter((a) => a.scope !== "business");
  const business = scraped.filter((a) => a.scope === "business");

  async function handleToggleScope(account: Account) {
    setBusyId(account.id);
    const nextScope = account.scope === "business" ? "household" : "business";
    try {
      await updateAccount(account.id, { scope: nextScope });
      showToast(
        nextScope === "business"
          ? "החשבון הוצא מסיכומי משק הבית"
          : "החשבון חזר לסיכומי משק הבית",
        "success",
      );
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שגיאה בעדכון החשבון", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (scraped.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl text-text-primary">חשבונות מסונכרנים</h2>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {household.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            busy={busyId === account.id}
            onToggleScope={(target) => void handleToggleScope(target)}
          />
        ))}
      </ul>

      {business.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="font-display text-lg text-text-primary">חשבונות עסקיים</h3>
            <p className="text-sm text-text-secondary">
              לא נכללים בדשבורד, בניתוח ובתקציבים. הפעילות שלהם נצפית מכאן בלבד.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {business.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                busy={busyId === account.id}
                onToggleScope={(target) => void handleToggleScope(target)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

"use client";

/**
 * One detailed card per account (bank, credit card, manual): label, owner, balance, period
 * in/out or spent, transaction count, last activity, 6-month spend bars and quick links.
 * Account-level edits (name, owner, business flag) live in the ⋯ menu and an inline edit panel;
 * connection settings live under Settings. Summary data comes from the page (account-summary.ts).
 */
import type { Account, Person } from "@moneytrack/contracts";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AccountActionsMenu } from "@/components/accounts/account-actions-menu";
import { trendBarHeights, type AccountSummary } from "@/components/accounts/account-summary";
import { Icon } from "@/components/ui/icon";
import { accountLabel } from "@/lib/account-label";
import { formatIls } from "@/lib/currency";
import { formatMonthYear, formatShortDate } from "@/lib/dates";
import he from "@/locales/he.json";

export type SummaryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; summary: AccountSummary };

export type AccountPatch = {
  displayName?: string;
  ownerPersonId?: string | null;
  scope?: "household" | "business";
};

type AccountCardProps = {
  account: Account;
  people: readonly Person[];
  state: SummaryState;
  /** True when the global period is "all": figures then cover the 6-month window. */
  wholeWindow: boolean;
  busy: boolean;
  onUpdate: (account: Account, patch: AccountPatch) => Promise<boolean>;
};

const linkClass =
  "inline-flex min-h-11 items-center rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-primary hover:bg-surface-elevated";

function kindIcon(kind: Account["kind"]) {
  if (kind === "credit_card") return CreditCard;
  return kind === "cash" ? Wallet : Banknote;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-medium text-text-primary">
        <bdi dir="ltr">{formatIls(value)}</bdi>
      </p>
    </div>
  );
}

function Trend({ summary }: { summary: AccountSummary }) {
  const heights = trendBarHeights(summary.trend);
  return (
    <div role="img" aria-label={he.accounts.trendLabel}>
      <div className="flex h-10 items-end gap-1" dir="ltr">
        {summary.trend.map((point, i) => (
          <div
            key={point.period}
            title={`${formatMonthYear(point.period)}: ${formatIls(point.out)}`}
            className="flex-1 rounded-sm bg-brand-blue-500/70"
            style={{ height: `${Math.max(heights[i] ?? 0, 4)}%`, opacity: heights[i] ? 1 : 0.25 }}
          />
        ))}
      </div>
    </div>
  );
}

function EditPanel({
  account,
  people,
  onSave,
  onCancel,
}: {
  account: Account;
  people: readonly Person[];
  onSave: (patch: AccountPatch) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.displayName);
  const [owner, setOwner] = useState(account.ownerPersonId ?? "");
  const [saving, setSaving] = useState(false);
  const fieldClass =
    "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-card px-3 text-sm text-text-primary";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const ok = await onSave({ displayName: trimmed, ownerPersonId: owner || null });
    setSaving(false);
    if (ok) onCancel();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-lg bg-surface-elevated p-3">
      <label className="block text-xs text-text-muted" htmlFor={`name-${account.id}`}>
        {he.accounts.name}
        <input
          id={`name-${account.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className="block text-xs text-text-muted" htmlFor={`owner-${account.id}`}>
        {he.accounts.owner}
        <select
          id={`owner-${account.id}`}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className={`${fieldClass} mt-1`}
        >
          <option value="">{he.accounts.noOwner}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-lg bg-brand-blue-500 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {he.accounts.save}
        </button>
        <button type="button" onClick={onCancel} className={linkClass}>
          {he.accounts.cancel}
        </button>
      </div>
    </form>
  );
}

export function AccountCard({ account, people, state, wholeWindow, busy, onUpdate }: AccountCardProps) {
  const [editing, setEditing] = useState(false);
  const label = accountLabel({
    displayName: account.displayName,
    institutionCode: account.institutionCode,
    last4: account.numberLast4,
  });
  const ownerName = people.find((p) => p.id === account.ownerPersonId)?.displayName;
  const isCard = account.kind === "credit_card";
  const href = `/transactions?accountIds=${encodeURIComponent(account.id)}`;

  return (
    <li className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface-card px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-text-primary">
            <Icon icon={kindIcon(account.kind)} size={16} />
            <span className="truncate">{label}</span>
          </p>
          <p className="mt-1 text-xs text-text-muted">{ownerName ?? he.accounts.noOwner}</p>
        </div>
        <AccountActionsMenu
          accountName={label}
          isBusiness={account.scope === "business"}
          busy={busy}
          onToggleScope={() =>
            void onUpdate(account, { scope: account.scope === "business" ? "household" : "business" })
          }
          onEdit={() => setEditing(true)}
        />
      </div>

      {editing ? (
        <EditPanel
          account={account}
          people={people}
          onSave={(patch) => onUpdate(account, patch)}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      <div>
        <p className="text-xs text-text-muted">{isCard ? he.accounts.cardBalance : he.accounts.balance}</p>
        {account.balanceIls === null ? (
          <p className="text-sm text-text-secondary">{he.accounts.notSynced}</p>
        ) : (
          <p className="font-display text-2xl text-text-primary">
            <bdi dir="ltr">{formatIls(account.balanceIls)}</bdi>
          </p>
        )}
        {account.balanceDate ? (
          <p className="mt-1 text-xs text-text-muted">
            {he.accounts.asOf.replace("{date}", formatShortDate(account.balanceDate))}
          </p>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-elevated" aria-hidden="true" />
      ) : state.status === "error" ? (
        <p className="text-sm text-text-secondary">{he.accounts.summaryFailed}</p>
      ) : (
        <div className="space-y-3">
          {wholeWindow ? <p className="text-xs text-text-muted">{he.accounts.periodAll}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            {isCard ? (
              <Stat label={he.accounts.spent} value={state.summary.net} />
            ) : (
              <>
                <Stat label={he.accounts.monthIn} value={state.summary.moneyIn} />
                <Stat label={he.accounts.monthOut} value={state.summary.moneyOut} />
              </>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            {state.summary.lastActivity
              ? `${he.accounts.txCount.replace("{count}", String(state.summary.count))} · ${he.accounts.lastActivity.replace("{date}", formatShortDate(state.summary.lastActivity))}`
              : he.accounts.noActivity}
          </p>
          <Trend summary={state.summary} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={href} className={linkClass}>
          {he.accounts.toTransactions}
        </Link>
        {account.kind === "bank" ? (
          <Link href="/bank" className={linkClass}>
            {he.accounts.toBank}
          </Link>
        ) : null}
        {isCard ? (
          <Link href="/credit" className={linkClass}>
            {he.accounts.toCredit}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

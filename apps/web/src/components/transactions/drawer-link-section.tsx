"use client";

/**
 * Collapsible "link to a related transaction" section: existing links (read-only, the API has no
 * unlink endpoint), a suggestion picker (same absolute amount within +-60 days, plus free-text
 * search) and a link-type select with plain-Hebrew explanations. Data loads lazily on first open.
 * Used by: transaction-detail-drawer.
 */
import type { Account, Transaction, TransactionLink, TransactionLinkType } from "@moneytrack/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { DrawerCollapsible } from "@/components/transactions/drawer-collapsible";
import { fetchTransactionDetail, fetchTransactionPage } from "@/components/transactions/transaction-api";
import {
  LINK_WINDOW_DAYS,
  rankLinkSuggestions,
} from "@/components/transactions/transaction-drawer-helpers";
import { fetchAccounts } from "@/lib/api-client";
import { formatIlsExact } from "@/lib/currency";
import he from "@/locales/he.json";

const copy = he.transactionDrawer;
const LINK_TYPES = ["refund_of", "internal_transfer", "card_settlement", "duplicate_of"] as const;

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL").format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

function TransactionSummary({
  row,
  accountNames,
}: {
  row: Transaction;
  accountNames: Map<string, string>;
}) {
  const account = accountNames.get(row.accountId);
  return (
    <span className="flex min-w-0 flex-col text-start">
      <span className="truncate text-sm text-text-primary">{row.descriptionRaw}</span>
      <span className="text-xs text-text-muted">
        {formatDate(row.transactionDate)}
        {account ? ` · ${account}` : ""}
        {" · "}
        <bdi dir="ltr">{formatIlsExact(row.amountIls)}</bdi>
      </span>
    </span>
  );
}

type DrawerLinkSectionProps = {
  transaction: Transaction;
  links: TransactionLink[];
  saving: boolean;
  /** Resolves true when the link was created. */
  onLink: (toId: string, linkType: TransactionLinkType) => Promise<boolean>;
};

export function DrawerLinkSection({ transaction, links, saving, onLink }: DrawerLinkSectionProps) {
  const [opened, setOpened] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [candidates, setCandidates] = useState<Transaction[] | null>(null);
  const [searchHits, setSearchHits] = useState<Transaction[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Transaction | null>(null);
  const [linkType, setLinkType] = useState<TransactionLinkType>("refund_of");
  const [others, setOthers] = useState<Map<string, Transaction>>(new Map());
  const searchSeq = useRef(0);

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.displayName])),
    [accounts],
  );
  const linkedIds = useMemo(
    () => new Set(links.map((link) => (link.fromId === transaction.id ? link.toId : link.fromId))),
    [links, transaction.id],
  );
  const linkedKey = [...linkedIds].join(",");

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    const amount = Math.abs(transaction.amountIls);
    const filterFor = (signed: number) => ({
      dateFrom: shiftIso(transaction.transactionDate, -LINK_WINDOW_DAYS),
      dateTo: shiftIso(transaction.transactionDate, LINK_WINDOW_DAYS),
      amountMin: signed - 0.005,
      amountMax: signed + 0.005,
    });
    void Promise.all([
      fetchTransactionPage(filterFor(amount), { limit: 50 }),
      fetchTransactionPage(filterFor(-amount), { limit: 50 }),
      fetchAccounts().catch(() => [] as Account[]),
    ])
      .then(([plus, minus, accountRows]) => {
        if (cancelled) return;
        setCandidates([...plus.items, ...minus.items]);
        setAccounts(accountRows);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, transaction.amountIls, transaction.transactionDate]);

  useEffect(() => {
    const text = query.trim();
    const seq = ++searchSeq.current;
    if (text.length < 2) {
      setSearchHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void fetchTransactionPage(undefined, { freeText: text, limit: 20 })
        .then((page) => {
          if (seq === searchSeq.current) setSearchHits(page.items);
        })
        .catch(() => {
          if (seq === searchSeq.current) setSearchHits([]);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const ids = linkedKey ? linkedKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(ids.map((id) => fetchTransactionDetail(id))).then((results) => {
      if (cancelled) return;
      const next = new Map<string, Transaction>();
      results.forEach((result, index) => {
        const id = ids[index];
        if (id && result.status === "fulfilled") next.set(id, result.value.transaction);
      });
      setOthers(next);
    });
    return () => {
      cancelled = true;
    };
  }, [linkedKey]);

  const suggestions = useMemo(
    () =>
      rankLinkSuggestions([...(candidates ?? []), ...searchHits], transaction, linkedIds).slice(
        0,
        12,
      ),
    [candidates, searchHits, transaction, linkedIds],
  );

  async function submit(): Promise<void> {
    if (!picked) return;
    if (await onLink(picked.id, linkType)) {
      setPicked(null);
      setQuery("");
    }
  }

  return (
    <DrawerCollapsible
      title={copy.linkTitle}
      helper={copy.linkHelper}
      onToggle={(open) => {
        if (open) setOpened(true);
      }}
    >
      {links.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text-primary">{copy.linkExistingTitle}</h4>
          <ul className="space-y-2 text-xs text-text-secondary">
            {links.map((link) => {
              const otherId = link.fromId === transaction.id ? link.toId : link.fromId;
              const other = others.get(otherId);
              return (
                <li key={link.id} className="rounded-lg bg-surface-elevated px-3 py-2">
                  <span className="font-medium text-text-primary">
                    {copy.linkTypes[link.linkType]?.label ?? link.linkType}
                  </span>
                  {link.source === "manual" ? ` · ${copy.linkManual}` : ` · ${copy.linkAuto}`}
                  <div className="mt-1">
                    {other ? (
                      <TransactionSummary row={other} accountNames={accountNames} />
                    ) : (
                      copy.linkOtherUnknown
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-muted">{copy.linkExistingNote}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-text-primary">{copy.linkSuggestionsTitle}</h4>
        <p className="text-xs text-text-muted">{copy.linkSuggestionsHelper}</p>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={copy.linkSearchLabel}
          placeholder={copy.linkSearchPlaceholder}
          className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm"
        />
        {candidates === null ? (
          <p className="text-xs text-text-muted">{copy.linkSuggestionsLoading}</p>
        ) : suggestions.length === 0 ? (
          <p className="text-xs text-text-muted">{copy.linkSuggestionsEmpty}</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {suggestions.map((row) => {
              const active = picked?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPicked(active ? null : row)}
                    className={[
                      "flex min-h-11 w-full items-center rounded-lg border px-3 py-2",
                      active
                        ? "border-brand-blue-500 bg-brand-blue-500/10"
                        : "border-border-subtle hover:bg-surface-elevated",
                    ].join(" ")}
                  >
                    <TransactionSummary row={row} accountNames={accountNames} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold text-text-primary" htmlFor="tx-link-type">
          {copy.linkTypeLabel}
        </label>
        <select
          id="tx-link-type"
          value={linkType}
          onChange={(event) => setLinkType(event.target.value as TransactionLinkType)}
          className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm"
        >
          {LINK_TYPES.map((value) => (
            <option key={value} value={value}>
              {copy.linkTypes[value].label}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted">{copy.linkTypes[linkType].hint}</p>
      </div>

      {picked ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>{copy.linkPicked}</span>
          <span className="font-medium text-text-primary">{picked.descriptionRaw}</span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="min-h-11 text-brand-blue-500"
          >
            {copy.linkClearPick}
          </button>
        </p>
      ) : null}
      <button
        type="button"
        disabled={saving || !picked}
        onClick={() => void submit()}
        className="min-h-11 w-full rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {copy.linkSubmit}
      </button>
    </DrawerCollapsible>
  );
}

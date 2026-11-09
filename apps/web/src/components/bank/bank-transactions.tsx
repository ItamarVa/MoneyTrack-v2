"use client";

/**
 * Paged transaction list of one bank account and period: debounced search, "load more" through the
 * transactions API (cursor), compact rows and the shared detail drawer (same wiring as the credit
 * page). The list resets whenever the filter or search changes; a stale response is dropped.
 * `onChanged` tells the page to refresh the header totals after a drawer edit.
 */
import type { AnalysisFilter, Category, Tag, Transaction } from "@moneytrack/contracts";
import { useCallback, useEffect, useState } from "react";
import { CompactTransactionRow } from "@/components/transactions/compact-transaction-row";
import { fetchTransactionDetail, fetchTransactionPage } from "@/components/transactions/transaction-api";
import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";
import { fetchTags } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.bankPage;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type BankTransactionsProps = {
  filter: AnalysisFilter;
  categories: Category[];
  onChanged: () => void;
};

export function BankTransactions({ filter, categories, onChanged }: BankTransactionsProps) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    // Tags only feed the drawer; the list works without them.
    void fetchTags().then(setTags, () => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void fetchTransactionPage(filter, { limit: PAGE_SIZE, freeText: term || undefined }).then(
      (page) => {
        if (cancelled) return;
        setRows(page.items);
        setCursor(page.nextCursor);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // filter is represented by filterKey.
  }, [filterKey, term]);

  async function loadMore(): Promise<void> {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchTransactionPage(filter, {
        cursor,
        limit: PAGE_SIZE,
        freeText: term || undefined,
      });
      setRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...page.items.filter((row) => !seen.has(row.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const patchRow = useCallback((updated: Transaction) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
  }, []);

  function refreshOpenRow(): void {
    if (!detailId) return;
    void fetchTransactionDetail(detailId).then(
      (detail) => {
        patchRow(detail.transaction);
        onChanged();
      },
      () => undefined,
    );
  }

  return (
    <section
      aria-label={copy.listTitle}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg text-text-primary">{copy.listTitle}</h2>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={copy.searchLabel}
          placeholder={copy.searchPlaceholder}
          className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-base text-text-primary sm:max-w-xs"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-brand-orange-500">
          {copy.listFailed}
        </p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-text-muted">{copy.loading}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">{term ? copy.noMatches : copy.empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border-subtle">
          {rows.map((row) => (
            <CompactTransactionRow
              key={row.id}
              row={row}
              categories={categories}
              onOpen={setDetailId}
              onRowChanged={patchRow}
            />
          ))}
        </ul>
      )}

      {cursor && !loading ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-2 min-h-11 w-full rounded-lg border border-border-strong text-sm font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-60"
        >
          {copy.showMore}
        </button>
      ) : null}

      <TransactionDetailDrawer
        open={detailId !== null}
        transactionId={detailId}
        tags={tags}
        categories={categories}
        onClose={() => setDetailId(null)}
        onChanged={refreshOpenRow}
        onRowChanged={(updated) => {
          patchRow(updated);
          onChanged();
        }}
      />
    </section>
  );
}

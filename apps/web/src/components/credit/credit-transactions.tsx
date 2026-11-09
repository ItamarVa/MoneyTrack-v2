"use client";

/**
 * Card transactions for the chosen month as compact one-line rows (CompactTransactionRow);
 * a row opens the shared detail drawer. Rows excluded from totals stay listed
 * (the row badges them) although the ring above omits them. Shows 20 rows at a time; the
 * full filterable table is one link away on /transactions.
 */
import type { AnalysisFilter, Category, Tag, Transaction } from "@moneytrack/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CompactTransactionRow } from "@/components/transactions/compact-transaction-row";
import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";
import { fetchTransactionDetail } from "@/components/transactions/transaction-api";
import { fetchTags, fetchTransactions } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.creditPage.transactions;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type CreditTransactionsProps = {
  rows: Transaction[];
  /** The page filter (period, cards, person, merchant); the search adds freeText on top. */
  filter: AnalysisFilter;
  categories: Category[];
  /** accountId -> card label; only shown when more than one card is in play. */
  cardNames: ReadonlyMap<string, string> | null;
  allUrl: string;
  onRowChanged: (updated: Transaction) => void;
};

export function CreditTransactions({
  rows,
  filter,
  categories,
  cardNames,
  allUrl,
  onRowChanged,
}: CreditTransactionsProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Transaction[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const term = query.trim();

  useEffect(() => {
    // Tags only feed the drawer; the list works without them.
    void fetchTags().then(setTags, () => undefined);
  }, []);

  // Debounced server search; `cancelled` drops responses that arrive after a newer keystroke.
  useEffect(() => {
    if (term === "") {
      setFound(null);
      setSearchFailed(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchTransactions({ ...filter, freeText: term }).then(
        (result) => {
          if (cancelled) return;
          setSearchFailed(false);
          setFound(result);
        },
        () => {
          if (!cancelled) setSearchFailed(true);
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, filter]);

  const shown = useMemo(() => {
    if (found === null) return rows;
    // Row edits patch the page rows; mirror them onto the search results.
    const edited = new Map(rows.map((row) => [row.id, row]));
    return found.map((row) => edited.get(row.id) ?? row);
  }, [found, rows]);

  // Note/exclude edits in the drawer: refetch the row so the list reflects them.
  function refreshOpenRow(): void {
    if (!detailId) return;
    void fetchTransactionDetail(detailId).then(
      (detail) => onRowChanged(detail.transaction),
      () => undefined,
    );
  }
  if (rows.length === 0 && term === "") return null;

  return (
    <section
      aria-label={copy.title}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-text-primary">{copy.title}</h2>
        <Link
          href={allUrl}
          className="inline-flex min-h-11 items-center text-sm text-brand-blue-500 hover:underline"
        >
          {copy.allLink}
        </Link>
      </div>

      <div className="relative mt-2">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(PAGE_SIZE);
          }}
          aria-label={he.credit.search.label}
          placeholder={he.credit.search.placeholder}
          className="min-h-11 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 pe-11 text-sm text-text-primary placeholder:text-text-muted"
        />
        {query !== "" ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={he.credit.search.clear}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-text-muted hover:text-text-primary"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
      {searchFailed ? (
        <p role="alert" className="mt-2 text-sm text-brand-orange-500">
          {he.credit.search.failed}
        </p>
      ) : null}
      {term !== "" && found !== null && shown.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{he.credit.search.empty}</p>
      ) : null}

      <ul className="mt-1 divide-y divide-border-subtle">
        {shown.slice(0, visible).map((row) => (
          <CompactTransactionRow
            key={row.id}
            row={row}
            categories={categories}
            sourceLabel={cardNames?.get(row.accountId) ?? null}
            onOpen={setDetailId}
            onRowChanged={onRowChanged}
          />
        ))}
      </ul>

      {shown.length > visible ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="mt-2 min-h-11 w-full rounded-lg border border-border-strong text-sm font-medium text-text-primary hover:bg-surface-elevated"
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
        onRowChanged={onRowChanged}
      />
    </section>
  );
}

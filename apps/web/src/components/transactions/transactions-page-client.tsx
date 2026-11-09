"use client";







/**



 * Transactions list page: filters, paginated fetch, summary totals,



 * detail drawer, and highlight deep-link from alerts.



 */



import { useCallback, useEffect, useMemo, useRef, useState } from "react";



import { useRouter, useSearchParams } from "next/navigation";



import type {
  Account,
  AnalysisFilter,
  Card,
  Category,
  Person,
  SalarySource,
  Tag,
  Transaction,
  TransactionKind,
} from "@moneytrack/contracts";
import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";



import { EmptyState } from "@/components/empty-state";
import { ALL_PERIOD, periodToFilter, useGlobalPeriod } from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";



import { AddTransactionModal } from "@/components/transactions/add-transaction-modal";



import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";



import { TransactionFiltersBar } from "@/components/transactions/transaction-filters-bar";



import { TransactionTable } from "@/components/transactions/transaction-table";
import { createLatestRequestGuard } from "@/components/transactions/latest-request-guard";



import { fetchTransactionPage } from "@/components/transactions/transaction-api";



import {
  fetchAccounts,
  fetchAnalysisSummary,
  fetchCards,
  fetchCategories,
  fetchMerchants,
  fetchPeople,
  fetchSalarySources,
  fetchTags,
} from "@/lib/api-client";



import {



  kindsFromSearchParams,



  transactionsFilterFromSearchParams,



  type TransactionSortBy,



  type TransactionSortDir,



} from "@/lib/analysis-filter";



import { formatIls } from "@/lib/currency";
import { sourceOptions } from "@/lib/transaction-source";



import { formatMonthYear } from "@/lib/dates";
import {
  clearAllUpdates,
  listQueryString,
  mergeListUpdates,
  type ListFilterUpdates,
} from "@/components/transactions/transaction-list-query";
import type { FilterSheetApply } from "@/components/transactions/transaction-filter-sheet";
import he from "@/locales/he.json";
import {
  PROBE_LIMIT,
  otherMonthsCountLabel,
  shouldProbeAllPeriod,
  withoutDateBounds,
} from "@/components/transactions/other-months-notice";

const copy = he.transactionsUx.header;
const noticeCopy = he.otherMonthsNotice;







const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;



/** PaginationQuerySchema caps the page size. */



const MAX_LIMIT = 500;



const SORT_BY_VALUES: TransactionSortBy[] = ["date", "amount", "description", "category", "kind"];







function parseSortBy(value: string | null): TransactionSortBy {



  if (value && SORT_BY_VALUES.includes(value as TransactionSortBy)) {



    return value as TransactionSortBy;



  }



  return "date";



}







function parseSortDir(value: string | null): TransactionSortDir {



  return value === "asc" ? "asc" : "desc";



}







function periodCaption(filter: AnalysisFilter, allPeriod: boolean): string {



  const basis = (filter.dateBasis ?? DEFAULT_DATE_BASIS) === "charge" ? "לפי מועד חיוב" : "לפי תאריך עסקה";



  if (allPeriod) return `כל התקופה · ${basis}`;



  const month = formatMonthYear(filter.dateTo ?? filter.dateFrom ?? "");



  return `${month} · ${basis}`;



}







export function TransactionsPageClient() {



  const router = useRouter();



  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlPeriod = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    if (params.get("period") === "all") return ALL_PERIOD;
    const dateFrom = params.get("dateFrom");
    return dateFrom ? dateFrom.slice(0, 7) : null;
  }, [searchKey]);

  const { period, ready } = useScreenPeriod(urlPeriod);
  const { setPeriod } = useGlobalPeriod();

  const { filter: listFilter, allPeriod } = useMemo(
    () =>
      transactionsFilterFromSearchParams(new URLSearchParams(searchKey), {
        fallbackFilter: periodToFilter(period),
      }),
    [searchKey, period],
  );

  const sortBy = parseSortBy(searchParams.get("sortBy"));
  const sortDir = parseSortDir(searchParams.get("sortDir"));

  const kinds = useMemo(
    () => kindsFromSearchParams(new URLSearchParams(searchKey)),
    [searchKey],
  );

  const highlightId = searchParams.get("highlight");







  const [transactions, setTransactions] = useState<Transaction[]>([]);



  const [nextCursor, setNextCursor] = useState<string | null>(null);



  const [accounts, setAccounts] = useState<Account[]>([]);



  const [categories, setCategories] = useState<Category[]>([]);



  const [tags, setTags] = useState<Tag[]>([]);



  const [merchants, setMerchants] = useState<{ id: string; name: string }[]>([]);



  const [people, setPeople] = useState<Person[]>([]);



  const [cards, setCards] = useState<Card[]>([]);



  const sources = useMemo(() => sourceOptions(accounts, cards), [accounts, cards]);



  const [salarySources, setSalarySources] = useState<SalarySource[]>([]);



  const [searchDraft, setSearchDraft] = useState(listFilter.freeText ?? "");



  const [totals, setTotals] = useState<{ expensesIls: number; incomeIls: number } | null>(null);



  const [loading, setLoading] = useState(true);



  const [loadingMore, setLoadingMore] = useState(false);



  const [modalOpen, setModalOpen] = useState(false);



  const [detailId, setDetailId] = useState<string | null>(null);



  const [error, setError] = useState<string | null>(null);



  const loadedCount = useRef(0);
const submittedSearch = useRef(listFilter.freeText ?? "");
const listGuard = useRef(createLatestRequestGuard());
const probeGuard = useRef(createLatestRequestGuard());
const [otherMonthsLabel, setOtherMonthsLabel] = useState<string | null>(null);



  loadedCount.current = transactions.length;







  useEffect(() => {
// Skip the echo of our own debounced navigation: resetting here would clobber keystrokes typed meanwhile.
if ((listFilter.freeText ?? "") === submittedSearch.current) return;
submittedSearch.current = listFilter.freeText ?? "";
setSearchDraft(listFilter.freeText ?? "");
}, [listFilter.freeText]);







  useEffect(() => {



    void fetchCategories().then(setCategories);



  }, []);







  useEffect(() => {



    if (!listFilter.merchantIds?.length) return;



    void fetchMerchants().then(setMerchants);



  }, [listFilter.merchantIds]);







  useEffect(() => {



    if (!listFilter.personIds?.length) return;



    void fetchPeople().then(setPeople);



  }, [listFilter.personIds]);







  useEffect(() => {
    void fetchCards().then(setCards);
  }, []);







  const navigateQuery = useCallback(



    (next: {



      filter?: AnalysisFilter;



      kinds?: TransactionKind[];



      sortBy?: TransactionSortBy;



      sortDir?: TransactionSortDir;



      allPeriod?: boolean;



    }) => {



      const query = listQueryString({
        filter: next.filter ?? listFilter,
        kinds: "kinds" in next ? next.kinds : kinds,
        sortBy: next.sortBy ?? sortBy,
        sortDir: next.sortDir ?? sortDir,
        allPeriod: next.allPeriod ?? allPeriod,
        highlight: searchParams.get("highlight"),
      });



      router.replace(query ? `/transactions?${query}` : "/transactions");



    },



    [router, searchParams, listFilter, kinds, sortBy, sortDir, allPeriod],



  );







  useEffect(() => {



    if (!ready) return;



    const params = new URLSearchParams(searchKey);



    const urlAll = params.get("period") === "all";



    const urlMonth = params.get("dateFrom")?.slice(0, 7) ?? null;



    const periodAll = period === ALL_PERIOD;



    const urlMatchesPeriod =



      periodAll



        ? urlAll && !params.get("dateFrom")



        : !urlAll && urlMonth === period;



    if (urlMatchesPeriod) return;



    const periodFilter = periodToFilter(period);



    navigateQuery({



      filter: { ...listFilter, ...periodFilter },



      allPeriod: periodAll,



    });



  }, [ready, period, searchKey, listFilter, navigateQuery]);







  const loadPage = useCallback(



    async (cursor?: string, append = false, limit = PAGE_SIZE) => {
const isLatest = listGuard.current.begin();
setError(null);
try {



        const page = await fetchTransactionPage(listFilter, {



          cursor,



          limit,



          freeText: listFilter.freeText || undefined,



          sortBy,



          sortDir,



          kinds,
});
if (!isLatest()) return;
setTransactions((current) => (append ? [...current, ...page.items] : page.items));



        setNextCursor(page.nextCursor);







        if (!append) {



          const [acc, tagRows, salarySourceRows] = await Promise.all([
            fetchAccounts(),
            fetchTags(),
            fetchSalarySources(),
          ]);



          setAccounts(acc);



          setTags(tagRows);



          if (!isLatest()) return;
setSalarySources(salarySourceRows);
}
} catch (err) {
if (!isLatest()) return;
setError(err instanceof Error ? err.message : "שגיאה בטעינה");
} finally {
if (isLatest()) {
setLoading(false);
setLoadingMore(false);
}
}



    },



    [listFilter, sortBy, sortDir, kinds],



  );







  /**



   * Refreshes without flipping `loading`: the spinner replaces the table, and



   * remounting it resets the scroll position. Re-requests as many rows as are on



   * screen so pages already loaded do not vanish.



   */



  const reload = useCallback(async () => {



    await loadPage(undefined, false, Math.min(Math.max(loadedCount.current, PAGE_SIZE), MAX_LIMIT));



  }, [loadPage]);







  /** A single row changed and the row set did not — no refetch needed. */



  const patchRow = useCallback((updated: Transaction) => {



    setTransactions((current) =>



      current.map((row) => (row.id === updated.id ? updated : row)),



    );



  }, []);







  const handleApplySort = useCallback(



    (column: TransactionSortBy, dir: TransactionSortDir) => {



      navigateQuery({ sortBy: column, sortDir: dir });



    },



    [navigateQuery],



  );







  const handleApplyColumnFilter = useCallback(
    (updates: ListFilterUpdates) => {
      const next = mergeListUpdates({ filter: listFilter, kinds }, updates);
      navigateQuery({ filter: next.filter, kinds: next.kinds });
    },
    [navigateQuery, listFilter, kinds],
  );

  const handleApplySheet = useCallback(
    ({ updates, sortBy: nextSortBy, sortDir: nextSortDir }: FilterSheetApply) => {
      const next = mergeListUpdates({ filter: listFilter, kinds }, updates);
      navigateQuery({
        filter: next.filter,
        kinds: next.kinds,
        sortBy: nextSortBy,
        sortDir: nextSortDir,
      });
    },
    [navigateQuery, listFilter, kinds],
  );

  // Search-as-you-type: push the draft into the URL after a pause (the URL stays the source of truth).
useEffect(() => {
const next = searchDraft.trim();
if (next === (listFilter.freeText ?? "").trim()) return;
const timer = window.setTimeout(() => {
submittedSearch.current = next;
navigateQuery({ filter: { ...listFilter, freeText: next || undefined } });
}, SEARCH_DEBOUNCE_MS);
return () => window.clearTimeout(timer);
}, [searchDraft, listFilter, navigateQuery]);

const handleClearAll = useCallback(
    () => handleApplyColumnFilter(clearAllUpdates()),
    [handleApplyColumnFilter],
  );







  useEffect(() => {



    setLoading(true);



    setTransactions([]);



    setNextCursor(null);



    void loadPage();



  }, [loadPage]);







  useEffect(() => {



    let cancelled = false;



    void fetchAnalysisSummary({ ...listFilter, freeText: listFilter.freeText || undefined })



      .then((summary) => {



        if (!cancelled) {



          setTotals({



            expensesIls: summary.totalExpensesIls,



            incomeIls: summary.totalIncomeIls,



          });



        }



      })



      .catch(() => {



        if (!cancelled) setTotals(null);



      });



    return () => {



      cancelled = true;



    };



  }, [listFilter]);







  useEffect(() => {



    if (!highlightId) return;



    const timer = window.setTimeout(() => {



      const element = document.getElementById(`tx-row-${highlightId}`);



      element?.scrollIntoView({ behavior: "smooth", block: "center" });



    }, 300);



    return () => window.clearTimeout(timer);



  }, [highlightId, transactions]);







  useEffect(() => {



    if (highlightId && transactions.some((row) => row.id === highlightId)) {



      setDetailId(highlightId);



    }



  }, [highlightId, transactions]);







  useEffect(() => {



    const handler = () => {



      void reload();



    };



    window.addEventListener("moneytrack:classified", handler);



    return () => window.removeEventListener("moneytrack:classified", handler);



  }, [reload]);







  // Search is period-scoped: when the month is empty, count hits in all other months.
  const searchText = listFilter.freeText;
  const resultCount = transactions.length;
  useEffect(() => {
    const isLatest = probeGuard.current.begin();
    setOtherMonthsLabel(null);
    if (!shouldProbeAllPeriod({ freeText: searchText, allPeriod, loading, resultCount })) return;
    void fetchTransactionPage(withoutDateBounds(listFilter), {
      limit: PROBE_LIMIT,
      freeText: searchText || undefined,
      kinds,
    })
      .then((page) => {
        if (isLatest()) setOtherMonthsLabel(otherMonthsCountLabel(page.items.length, page.nextCursor !== null, page.total));
      })
      .catch(() => {});
  }, [searchText, allPeriod, loading, resultCount, listFilter, kinds]);

  const totalExpenses = totals?.expensesIls ?? 0;



  const totalIncome = totals?.incomeIls ?? 0;



  const periodLabel = periodCaption(listFilter, allPeriod);







  return (



    <div className="space-y-6">



      <header className="flex flex-wrap items-start justify-between gap-4">



        <div>



          <h1 className="font-display text-3xl text-text-primary">עסקאות</h1>



          <p className="mt-2 text-sm text-text-secondary">



            {transactions.length}
            {nextCursor ? "+" : ""} {copy.count}
            {" · "}
            {copy.expenses}{" "}



            <bdi dir="ltr" className="font-medium text-money-expense">



              {formatIls(totalExpenses)}



            </bdi>



            {" · "}
            {copy.income}{" "}



            <bdi dir="ltr" className="font-medium text-money-income">



              {formatIls(totalIncome)}



            </bdi>



            <span className="text-text-muted"> · {periodLabel}</span>



          </p>



        </div>



        <div className="flex flex-wrap gap-2">



          <button



            type="button"



            onClick={() => setModalOpen(true)}



            className="min-h-11 rounded-lg border border-border-subtle bg-surface-card px-5 text-sm font-semibold text-text-primary transition hover:bg-surface-elevated"
          >
            {copy.addTransaction}



          </button>



        </div>



      </header>







      <TransactionFiltersBar



        search={searchDraft}



        onSearchChange={setSearchDraft}



        onSearchSubmit={() => {
submittedSearch.current = searchDraft.trim();
navigateQuery({
filter: { ...listFilter, freeText: searchDraft.trim() || undefined },
});
}}



        filter={listFilter}



        kinds={kinds}



        categories={categories}



        tags={tags}



        accounts={accounts}



        merchants={merchants}



        people={people}



        cards={cards}



        salarySources={salarySources}
        sources={sources}
        sortBy={sortBy}
        sortDir={sortDir}
        onRemoveFilter={handleApplyColumnFilter}
        onApplySheet={handleApplySheet}
        onClearAll={handleClearAll}



      />







      {error ? (



        <p className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-brand-orange-500">



          {error}



        </p>



      ) : null}







      {otherMonthsLabel ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-primary">
          <span>{noticeCopy.found.replace("{count}", otherMonthsLabel)}</span>
          <button
            type="button"
            onClick={() => setPeriod(ALL_PERIOD)}
            className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white"
          >
            {noticeCopy.showAll}
          </button>
        </div>
      ) : null}

      {loading ? (



        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">



          טוען עסקאות…



        </div>



      ) : transactions.length === 0 ? (



        <EmptyState



          title="אין עדיין עסקאות"



          description="הוסיפו עסקה ידנית (ביט, פייבוקס, מזומן) או חברו בנק וסנכרנו מהדף חשבונות."



        >



          <button



            type="button"



            onClick={() => setModalOpen(true)}



            className="min-h-11 rounded-lg bg-brand-orange-500 px-5 text-sm font-semibold text-white"



          >



            הוסף עסקה ראשונה



          </button>



        </EmptyState>



      ) : (



        <>



          <TransactionTable



            rows={transactions}



            tags={tags}



            categories={categories}



            accounts={accounts}



            cards={cards}



            sources={sources}



            filter={listFilter}



            kinds={kinds}



            highlightId={highlightId}



            sortBy={sortBy}



            sortDir={sortDir}



            onApplySort={handleApplySort}



            onApplyColumnFilter={handleApplyColumnFilter}



            onChanged={reload}



            onRowChanged={patchRow}



            onOpenDetail={setDetailId}



          />



          {nextCursor ? (



            <div className="flex justify-center">



              <button



                type="button"



                disabled={loadingMore}



                onClick={() => {



                  setLoadingMore(true);



                  void loadPage(nextCursor, true);



                }}



                className="min-h-11 rounded-lg border border-border-subtle bg-surface-card px-6 text-sm font-semibold text-text-primary hover:bg-surface-elevated disabled:opacity-50"



              >



                {loadingMore ? "טוען…" : "טען עוד"}



              </button>



            </div>



          ) : null}



        </>



      )}







      <AddTransactionModal



        open={modalOpen}



        accounts={accounts}



        onClose={() => setModalOpen(false)}



        onCreated={reload}



      />







      <TransactionDetailDrawer



        open={detailId !== null}



        transactionId={detailId}



        tags={tags}



        categories={categories}



        onClose={() => setDetailId(null)}



        onChanged={reload}



        onRowChanged={patchRow}



      />



    </div>



  );



}





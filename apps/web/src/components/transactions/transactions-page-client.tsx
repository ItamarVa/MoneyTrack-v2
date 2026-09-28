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



import { EmptyState } from "@/components/empty-state";
import { ALL_PERIOD, periodToFilter } from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";



import { AddTransactionModal } from "@/components/transactions/add-transaction-modal";



import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";



import { TransactionFiltersBar } from "@/components/transactions/transaction-filters-bar";



import { TransactionTable } from "@/components/transactions/transaction-table";



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



  filterToSearchParams,



  kindsFromSearchParams,



  transactionsFilterFromSearchParams,



  type TransactionSortBy,



  type TransactionSortDir,



} from "@/lib/analysis-filter";



import { formatIls } from "@/lib/currency";
import { sourceOptions } from "@/lib/transaction-source";



import { formatMonthYear } from "@/lib/dates";







const PAGE_SIZE = 50;



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



  const basis = filter.dateBasis === "charge" ? "לפי מועד חיוב" : "לפי תאריך עסקה";



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



  loadedCount.current = transactions.length;







  useEffect(() => {



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



    if (!listFilter.cardIds?.length) return;



    void fetchCards().then(setCards);



  }, [listFilter.cardIds]);







  const navigateQuery = useCallback(



    (next: {



      filter?: AnalysisFilter;



      kinds?: TransactionKind[];



      sortBy?: TransactionSortBy;



      sortDir?: TransactionSortDir;



      allPeriod?: boolean;



    }) => {



      const filter = next.filter ?? listFilter;



      const params = filterToSearchParams(filter, { kinds: next.kinds ?? kinds });



      params.set("sortBy", next.sortBy ?? sortBy);



      params.set("sortDir", next.sortDir ?? sortDir);



      const useAllPeriod = next.allPeriod ?? allPeriod;



      if (useAllPeriod) {



        params.delete("dateFrom");



        params.delete("dateTo");



        params.set("period", "all");



      } else {



        params.delete("period");



      }



      const highlight = searchParams.get("highlight");



      if (highlight) params.set("highlight", highlight);



      const query = params.toString();



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



          setSalarySources(salarySourceRows);



        }



      } catch (err) {



        setError(err instanceof Error ? err.message : "שגיאה בטעינה");



      } finally {



        setLoading(false);



        setLoadingMore(false);



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



    (updates: {



      filter?: Partial<AnalysisFilter>;



      kinds?: TransactionKind[];



      freeText?: string;



    }) => {



      const nextFilter: AnalysisFilter = {



        ...listFilter,



        ...updates.filter,



      };



      if (updates.freeText !== undefined) {



        nextFilter.freeText = updates.freeText;



      }



      navigateQuery({



        filter: nextFilter,



        kinds: updates.kinds !== undefined ? updates.kinds : kinds,



      });



    },



    [navigateQuery, listFilter, kinds],



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







  const totalExpenses = totals?.expensesIls ?? 0;



  const totalIncome = totals?.incomeIls ?? 0;



  const periodLabel = periodCaption(listFilter, allPeriod);







  return (



    <div className="space-y-6">



      <header className="flex flex-wrap items-start justify-between gap-4">



        <div>



          <h1 className="font-display text-3xl text-text-primary">עסקאות</h1>



          <p className="mt-2 text-sm text-text-secondary">



            {transactions.length} עסקאות טעונות



            {nextCursor ? " · יש עוד" : ""}



            {" · "}הוצאות{" "}



            <bdi dir="ltr" className="font-medium text-money-expense">



              {formatIls(totalExpenses)}



            </bdi>



            {" · "}



            הכנסות{" "}



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



            className="min-h-11 rounded-lg bg-brand-orange-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-orange-400"



          >



            הוסף עסקה



          </button>



        </div>



      </header>







      <TransactionFiltersBar



        search={searchDraft}



        onSearchChange={setSearchDraft}



        onSearchSubmit={() =>



          navigateQuery({



            filter: { ...listFilter, freeText: searchDraft.trim() || undefined },



          })



        }



        filter={listFilter}



        kinds={kinds}



        categories={categories}



        tags={tags}



        accounts={accounts}



        merchants={merchants}



        people={people}



        cards={cards}



        salarySources={salarySources}



        onRemoveFilter={handleApplyColumnFilter}



      />







      {error ? (



        <p className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-brand-orange-500">



          {error}



        </p>



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





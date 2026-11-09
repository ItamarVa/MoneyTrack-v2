"use client";

/**
 * Credit-card page: next charge, one filter bar (person, card, month basis), round category chart, top merchants and
 * the card's transactions. Person/card/merchant narrow ring, merchants and list together; default is everything. Card-side only — every query names the household credit_card
 * accounts in `accountIds`, so bank rows (including card settlements) never enter.
 * Two load stages: once per visit (cards, categories, next charge), then per month/basis/card.
 * Rows excluded from totals stay in the lists (marked by the row); only the breakdowns/charts drop them server-side.
 * The global header period drives the month; `all` is a valid period and must not crash.
 */
import type { Account, Category, CategoryBreakdownItem, DateBasis, Person, Transaction } from "@moneytrack/contracts";
import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { shiftGlobalPeriod, ALL_PERIOD, useGlobalPeriod } from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";
import { SkeletonPanel } from "@/components/ui/skeleton";
import { drillDownToTransactionsUrl } from "@/lib/analysis-filter";
import { fetchAccounts, fetchBreakdown, fetchCategories, fetchPeople, fetchTransactions } from "@/lib/api-client";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { fetchCreditSummary, localToday } from "./credit-api";
import { CreditBasisToggle, CreditCardChips, CreditPersonChips } from "./credit-controls";
import { CreditEmptyMonth, CreditNoCards } from "./credit-empty-states";
import { CreditMonthlyChart } from "./credit-monthly-chart";
import { CreditNextCharge } from "./credit-next-charge";
import { CreditRingSection } from "./credit-ring-section";
import { CreditTopMerchants } from "./credit-top-merchants";
import { CreditTransactions } from "./credit-transactions";
import type { CreditSummaryResponse } from "./credit-types";
import {
  cardLabel,
  categoryColorMap,
  chargesForCards,
  creditCardAccounts,
  creditFilter,
  merchantCategoryMap,
  selectedCardIds,
  validPersonId,
} from "./credit-utils";

const copy = he.creditPage;

type BaseData = { cards: Account[]; categories: Category[]; summary: CreditSummaryResponse; people: Person[] };
type MonthData = {
  items: CategoryBreakdownItem[];
  merchants: CategoryBreakdownItem[];
  rows: Transaction[];
};
/** Ring + list while one merchant is chosen; the merchant list itself always stays unfiltered. */
type MerchantView = { items: CategoryBreakdownItem[]; rows: Transaction[] };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : copy.loadFailed;
}

export function CreditPageClient() {
  const { period, ready } = useScreenPeriod(null);
  const { setPeriod } = useGlobalPeriod();
  const [basis, setBasis] = useState<DateBasis>(DEFAULT_DATE_BASIS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [merchantView, setMerchantView] = useState<MerchantView | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [base, setBase] = useState<BaseData | null>(null);
  const [month, setMonth] = useState<MonthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([fetchAccounts(), fetchCategories(), fetchCreditSummary(localToday()), fetchPeople()])
      .then(([accounts, categories, summary, people]) => {
        if (!cancelled) setBase({ cards: creditCardAccounts(accounts), categories, summary, people });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const cards = base?.cards;
  const cardIds = useMemo(() => selectedCardIds(cards ?? [], selectedId), [cards, selectedId]);
  const cardIdsKey = cardIds.join(",");
  const activePersonId = validPersonId(base?.people ?? [], personId);
  const filter = useMemo(
    () => creditFilter(period, basis, cardIdsKey ? cardIdsKey.split(",") : [], { personId: activePersonId }),
    [period, basis, cardIdsKey, activePersonId],
  );
  const viewFilter = useMemo(() => (merchantId ? { ...filter, merchantIds: [merchantId] } : filter), [filter, merchantId]);

  // A merchant chosen under other filters may not exist under new ones.
  useEffect(() => {
    setMerchantId(null);
  }, [filter]);

  useEffect(() => {
    if (!merchantId || cardIdsKey === "") {
      setMerchantView(null);
      return;
    }
    let cancelled = false;
    void Promise.all([fetchBreakdown(viewFilter, "category"), fetchTransactions(viewFilter)])
      .then(([categoryBreakdown, rows]) => {
        if (!cancelled)
          setMerchantView({ items: categoryBreakdown.items, rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId, viewFilter, cardIdsKey, reloadKey]);

  useEffect(() => {
    if (!ready || cardIdsKey === "") return;
    let cancelled = false;
    setMonth(null);
    setError(null);
    void Promise.all([
      fetchBreakdown(filter, "category"),
      fetchBreakdown(filter, "merchant"),
      fetchTransactions(filter),
    ])
      .then(([categoryBreakdown, merchantBreakdown, rows]) => {
        if (cancelled) return;
        setMonth({
          items: categoryBreakdown.items,
          merchants: merchantBreakdown.items,
          rows,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [ready, filter, cardIdsKey, reloadKey]);

  const patchRow = useCallback((updated: Transaction) => {
    const patch = (rows: Transaction[]) => rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row));
    setMonth((current) => (current ? { ...current, rows: patch(current.rows) } : current));
    setMerchantView((current) => (current ? { ...current, rows: patch(current.rows) } : current));
  }, []);

  // Hooks stay above the early returns below (rules of hooks).
  const categoryColors = useMemo(() => categoryColorMap(month?.items ?? []), [month]);
  const merchantCategories = useMemo(() => merchantCategoryMap(month?.rows ?? []), [month]);
  const periodLabel = formatMonthYear(period);
  const header = (
    <div id="credit-page-top">
      <h1 className="font-display text-2xl text-text-primary md:text-3xl">{copy.title}</h1>
      <p className="mt-1 text-sm text-text-muted">{fillTemplate(copy.subtitle, { period: periodLabel })}</p>
    </div>
  );

  if (error && !base) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <ErrorBanner message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      </div>
    );
  }

  if (!base || !ready) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <SkeletonPanel lines={3} />
        <SkeletonPanel lines={6} />
      </div>
    );
  }

  if (base.cards.length === 0) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <CreditNoCards />
      </div>
    );
  }

  const emptyMonth = month !== null && month.rows.length === 0 && month.items.length === 0;
  const merchantsReady = merchantId === null || merchantView !== null;
  const shownItems = merchantView?.items ?? month?.items ?? [];
  const shownRows = merchantView?.rows ?? month?.rows ?? [];
  const goToPreviousMonth = period === ALL_PERIOD ? null : () => setPeriod(shiftGlobalPeriod(period, -1));
  const cardNames =
    cardIds.length > 1
      ? new Map(base.cards.filter((card) => cardIds.includes(card.id)).map((card) => [card.id, cardLabel(card)]))
      : null;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden md:space-y-6">
      {header}

      {error ? <ErrorBanner message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : null}

      {base.people.length > 1 ? (
        <CreditPersonChips people={base.people} selectedId={activePersonId} onSelect={setPersonId} />
      ) : null}
      {base.cards.length > 1 ? (
        <CreditCardChips cards={base.cards} selectedId={selectedId} onSelect={setSelectedId} />
      ) : null}

      <CreditNextCharge cards={chargesForCards(base.summary.cards, cardIds)} today={base.summary.today} />

      <CreditBasisToggle value={basis} onChange={setBasis} />

      {month === null || !merchantsReady ? (
        <>
          <SkeletonPanel lines={6} />
          <SkeletonPanel lines={4} />
        </>
      ) : emptyMonth ? (
        <CreditEmptyMonth onPreviousMonth={goToPreviousMonth} />
      ) : (
        <>
          <CreditRingSection items={shownItems} filter={viewFilter} periodLabel={periodLabel} />
          <CreditMonthlyChart period={period} basis={basis} cardIds={cardIds} categories={base.categories} />
          <CreditTopMerchants
            items={month.merchants}
            categories={base.categories}
            merchantCategories={merchantCategories}
            categoryColors={categoryColors}
            activeMerchantId={merchantId}
            onSelectMerchant={setMerchantId}
          />
          <CreditTransactions
            key={`${period}|${basis}|${cardIdsKey}|${activePersonId ?? ""}|${merchantId ?? ""}`}
            rows={shownRows}
            filter={viewFilter}
            categories={base.categories}
            cardNames={cardNames}
            allUrl={drillDownToTransactionsUrl(viewFilter)}
            onRowChanged={patchRow}
          />
        </>
      )}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/5 px-4 py-3 text-sm text-brand-orange-500"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-lg border border-brand-orange-500/40 px-4 font-medium"
      >
        {copy.retry}
      </button>
    </div>
  );
}

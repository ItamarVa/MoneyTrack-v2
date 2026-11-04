"use client";

/**
 * Credit-card page: next charge, month-basis toggle, round category chart, top merchants and
 * the card's transactions. Card-side only — every query names the household credit_card
 * accounts in `accountIds`, so bank rows (including card settlements) never enter.
 * Two load stages: once per visit (cards, categories, next charge), then per month/basis/card.
 * The global header period drives the month; `all` is a valid period and must not crash.
 */
import type { Account, Category, CategoryBreakdownItem, DateBasis, Transaction } from "@moneytrack/contracts";
import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { shiftGlobalPeriod, ALL_PERIOD, useGlobalPeriod } from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";
import { SkeletonPanel } from "@/components/ui/skeleton";
import { drillDownToTransactionsUrl } from "@/lib/analysis-filter";
import { fetchAccounts, fetchBreakdown, fetchCategories, fetchTransactions } from "@/lib/api-client";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { fetchCreditSummary, localToday } from "./credit-api";
import { CreditBasisToggle, CreditCardChips } from "./credit-controls";
import { CreditEmptyMonth, CreditNoCards } from "./credit-empty-states";
import { CreditNextCharge } from "./credit-next-charge";
import { CreditRingSection } from "./credit-ring-section";
import { CreditTopMerchants } from "./credit-top-merchants";
import { CreditTransactions } from "./credit-transactions";
import type { CreditSummaryResponse } from "./credit-types";
import { cardLabel, chargesForCards, creditCardAccounts, creditFilter, selectedCardIds } from "./credit-utils";

const copy = he.creditPage;

type BaseData = { cards: Account[]; categories: Category[]; summary: CreditSummaryResponse };
type MonthData = {
  items: CategoryBreakdownItem[];
  merchants: CategoryBreakdownItem[];
  rows: Transaction[];
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : copy.loadFailed;
}

export function CreditPageClient() {
  const { period, ready } = useScreenPeriod(null);
  const { setPeriod } = useGlobalPeriod();
  const [basis, setBasis] = useState<DateBasis>(DEFAULT_DATE_BASIS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [base, setBase] = useState<BaseData | null>(null);
  const [month, setMonth] = useState<MonthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([fetchAccounts(), fetchCategories(), fetchCreditSummary(localToday())])
      .then(([accounts, categories, summary]) => {
        if (!cancelled) setBase({ cards: creditCardAccounts(accounts), categories, summary });
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
  const filter = useMemo(
    () => creditFilter(period, basis, cardIdsKey ? cardIdsKey.split(",") : []),
    [period, basis, cardIdsKey],
  );

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
          rows: rows.filter((row) => !row.excludedFromTotals),
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
    setMonth((current) =>
      current
        ? { ...current, rows: current.rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) }
        : current,
    );
  }, []);

  const periodLabel = formatMonthYear(period);
  const header = (
    <div>
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
  const goToPreviousMonth = period === ALL_PERIOD ? null : () => setPeriod(shiftGlobalPeriod(period, -1));
  const cardNames =
    cardIds.length > 1
      ? new Map(base.cards.filter((card) => cardIds.includes(card.id)).map((card) => [card.id, cardLabel(card)]))
      : null;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden md:space-y-6">
      {header}

      {error ? <ErrorBanner message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : null}

      {base.cards.length > 1 ? (
        <CreditCardChips cards={base.cards} selectedId={selectedId} onSelect={setSelectedId} />
      ) : null}

      <CreditNextCharge cards={chargesForCards(base.summary.cards, cardIds)} today={base.summary.today} />

      <CreditBasisToggle value={basis} onChange={setBasis} />

      {month === null ? (
        <>
          <SkeletonPanel lines={6} />
          <SkeletonPanel lines={4} />
        </>
      ) : emptyMonth ? (
        <CreditEmptyMonth onPreviousMonth={goToPreviousMonth} />
      ) : (
        <>
          <CreditRingSection items={month.items} filter={filter} periodLabel={periodLabel} />
          <CreditTopMerchants items={month.merchants} />
          <CreditTransactions
            key={`${period}|${basis}|${cardIdsKey}`}
            rows={month.rows}
            categories={base.categories}
            cardNames={cardNames}
            allUrl={drillDownToTransactionsUrl(filter)}
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

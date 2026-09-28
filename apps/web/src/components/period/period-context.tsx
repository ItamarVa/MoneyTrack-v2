"use client";

/**
 * Global period state for dashboard, transactions, analysis, and entity screens.
 * SSR defaults to the current month; localStorage (mt-period) hydrates after mount
 * like theme.ts. ALL_PERIOD means no date bounds on downstream filters.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { AnalysisFilter, DateBasis } from "@moneytrack/contracts";
import { monthBoundsFor } from "@/lib/analysis-filter";

export const PERIOD_STORAGE_KEY = "mt-period";
export const ALL_PERIOD = "all";
/** "YYYY-MM" or ALL_PERIOD. */
export type GlobalPeriod = string;

export function currentMonthPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function readStoredPeriod(): GlobalPeriod {
  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (!stored) return currentMonthPeriod();
    if (stored === ALL_PERIOD) return ALL_PERIOD;
    if (/^\d{4}-\d{2}$/.test(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode, SSR tests).
  }
  return currentMonthPeriod();
}

export function storePeriod(period: GlobalPeriod): void {
  try {
    localStorage.setItem(PERIOD_STORAGE_KEY, period);
  } catch {
    // Ignore quota / privacy errors.
  }
}

/** ALL_PERIOD drops dateFrom/dateTo; absent bounds already mean all time to every reader. */
export function periodToFilter(period: GlobalPeriod, dateBasis: DateBasis = "charge"): AnalysisFilter {
  if (period === ALL_PERIOD) {
    return { dateBasis };
  }
  const [year, month] = period.split("-").map(Number);
  const bounds = monthBoundsFor(new Date(year ?? 0, (month ?? 1) - 1, 1));
  return { dateBasis, ...bounds };
}

export function periodFromFilter(filter: AnalysisFilter, allPeriod = false): GlobalPeriod {
  if (allPeriod || (!filter.dateFrom && !filter.dateTo)) {
    return ALL_PERIOD;
  }
  const anchor = filter.dateFrom ?? filter.dateTo ?? "";
  return anchor.slice(0, 7);
}

export function shiftGlobalPeriod(period: GlobalPeriod, direction: -1 | 1): GlobalPeriod {
  if (period === ALL_PERIOD) return ALL_PERIOD;
  const [year, month] = period.split("-").map(Number);
  const shifted = new Date(year ?? 0, (month ?? 1) - 1 + direction, 1);
  const nextYear = shifted.getFullYear();
  const nextMonth = String(shifted.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

type PeriodContextValue = {
  period: GlobalPeriod;
  setPeriod: (next: GlobalPeriod) => void;
  isAll: boolean;
  hydrated: boolean;
};

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }): ReactElement {
  const [period, setPeriodState] = useState<GlobalPeriod>(currentMonthPeriod);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPeriodState(readStoredPeriod());
    setHydrated(true);
  }, []);

  const setPeriod = useCallback((next: GlobalPeriod) => {
    setPeriodState(next);
    storePeriod(next);
  }, []);

  const value = useMemo(
    () => ({
      period,
      setPeriod,
      isAll: period === ALL_PERIOD,
      hydrated,
    }),
    [period, setPeriod, hydrated],
  );

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function useGlobalPeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    throw new Error("useGlobalPeriod must be used within PeriodProvider");
  }
  return ctx;
}

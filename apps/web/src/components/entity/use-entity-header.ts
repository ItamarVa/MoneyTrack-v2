/**
 * Loads entity title and month totals from fetchEntityName plus two summary calls
 * (current and prior charge month) for the entity detail header.
 */
import type { BreakdownDimension } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { ALL_PERIOD } from "@/components/period/period-context";
import { fetchAnalysisSummary, fetchEntityName } from "@/lib/api-client";
import { computePctChange, filterForEntityPeriod, shiftPeriod } from "./entity-dimension";

export type EntityHeaderState = {
  title: string;
  transactionCount: number;
  totalIls: number;
  pctChange: number | null;
  loading: boolean;
  error: string | null;
};

export function useEntityHeader(
  dimension: BreakdownDimension,
  entityId: string,
  period: string,
): EntityHeaderState {
  const [state, setState] = useState<EntityHeaderState>({
    title: "",
    transactionCount: 0,
    totalIls: 0,
    pctChange: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!entityId) return;

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const currentFilter = filterForEntityPeriod(dimension, entityId, period);
    const isAllPeriod = period === ALL_PERIOD;

    const load = isAllPeriod
      ? Promise.all([fetchEntityName(dimension, entityId), fetchAnalysisSummary(currentFilter)])
      : Promise.all([
          fetchEntityName(dimension, entityId),
          fetchAnalysisSummary(currentFilter),
          fetchAnalysisSummary(
            filterForEntityPeriod(dimension, entityId, shiftPeriod(period, -1)),
          ),
        ]);

    void load
      .then((result) => {
        if (cancelled) return;
        const [title, current, previous] = isAllPeriod
          ? [result[0], result[1], null]
          : result;
        setState({
          title,
          transactionCount: current.transactionCount,
          totalIls: current.totalExpensesIls,
          pctChange: previous
            ? computePctChange(current.totalExpensesIls, previous.totalExpensesIls)
            : null,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "שגיאה בטעינת נתונים",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [dimension, entityId, period]);

  return state;
}

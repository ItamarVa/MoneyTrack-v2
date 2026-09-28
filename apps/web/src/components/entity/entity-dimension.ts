/**
 * Entity detail page helpers: period-scoped filters, secondary breakdown dimension,
 * slice-to-filter mapping, and bookmarkable page paths per breakdown dimension.
 */
import type { AnalysisFilter, BreakdownDimension } from "@moneytrack/contracts";
import type { RingDimension } from "@/components/charts/types";
import { ALL_PERIOD } from "@/components/period/period-context";
import { monthBoundsFor } from "@/lib/analysis-filter";
import type { EntityDrillStep } from "./entity-types";

export function currentMonthPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftPeriod(period: string, direction: -1 | 1): string {
  const [year, month] = period.split("-").map(Number);
  const shifted = new Date(year ?? 0, (month ?? 1) - 1 + direction, 1);
  const nextYear = shifted.getFullYear();
  const nextMonth = String(shifted.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function expandedMonthlyFilter(filter: AnalysisFilter): AnalysisFilter {
  const anchor = filter.dateFrom ?? filter.dateTo ?? new Date().toISOString().slice(0, 10);
  const date = new Date(anchor);
  date.setFullYear(date.getFullYear() - 1);
  return {
    ...filter,
    dateFrom: date.toISOString().slice(0, 10),
  };
}

export function entityPagePath(dimension: BreakdownDimension, entityId: string): string {
  if (dimension === "category") {
    return `/categories/${entityId}`;
  }
  return `/entities/${dimension}/${entityId}`;
}

export function filterForEntityPeriod(
  dimension: BreakdownDimension,
  entityId: string,
  period: string,
): AnalysisFilter {
  const base: AnalysisFilter =
    period === ALL_PERIOD
      ? { dateBasis: "charge" }
      : (() => {
          const [year, month] = period.split("-").map(Number);
          const bounds = monthBoundsFor(new Date(year ?? 0, (month ?? 1) - 1, 1));
          return {
            dateBasis: "charge",
            dateFrom: bounds.dateFrom,
            dateTo: bounds.dateTo,
          };
        })();

  switch (dimension) {
    case "category":
    case "subcategory":
      return { ...base, categoryIds: [entityId] };
    case "merchant":
      return { ...base, merchantIds: [entityId] };
    case "person":
      return { ...base, personIds: [entityId] };
    case "card":
      return { ...base, cardIds: [entityId] };
    case "account":
      return { ...base, accountIds: [entityId] };
    case "tag":
      return { ...base, tagIds: [entityId] };
    case "month": {
      const [entityYear, entityMonth] = entityId.split("-").map(Number);
      return {
        dateBasis: "charge",
        ...monthBoundsFor(new Date(entityYear ?? 0, (entityMonth ?? 1) - 1, 1)),
      };
    }
    default:
      return base;
  }
}

/** Next ring level in the entity-page drill chain. */
export function nextDrillDimension(current: BreakdownDimension): RingDimension {
  switch (current) {
    case "category":
      return "subcategory";
    case "subcategory":
      return "merchant";
    case "merchant":
      return "transaction";
    default:
      return "category";
  }
}

/** Fold drill steps onto a base filter via sliceToFilter. */
export function drillFilter(base: AnalysisFilter, steps: EntityDrillStep[]): AnalysisFilter {
  return steps.reduce<AnalysisFilter>(
    (filter, step) => ({ ...filter, ...sliceToFilter(step.dimension, step.id) }),
    base,
  );
}

export function sliceToFilter(
  dimension: BreakdownDimension,
  sliceId: string,
): Partial<AnalysisFilter> {
  switch (dimension) {
    case "category":
    case "subcategory":
      return { categoryIds: [sliceId] };
    case "merchant":
      return { merchantIds: [sliceId] };
    case "person":
      return { personIds: [sliceId] };
    case "card":
      return { cardIds: [sliceId] };
    case "account":
      return { accountIds: [sliceId] };
    case "tag":
      return { tagIds: [sliceId] };
    default:
      return {};
  }
}

const RING_ROOT_LABELS: Partial<Record<RingDimension, string>> = {
  category: "קטגוריות",
  subcategory: "תתי קטגוריה",
  merchant: "בתי עסק",
  transaction: "עסקאות",
  person: "אנשים",
  card: "כרטיסים",
  account: "חשבונות",
  tag: "תגיות",
  month: "חודשים",
};

export function breakdownRootLabel(dimension: RingDimension): string {
  return RING_ROOT_LABELS[dimension] ?? dimension;
}

export function periodFromFilter(filter: AnalysisFilter): string {
  const anchor = filter.dateFrom ?? filter.dateTo ?? "";
  const [year, month] = anchor.split("-");
  return year && month ? `${year}-${month}` : "";
}

export function computePctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

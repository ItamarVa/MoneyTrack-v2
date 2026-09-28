/**
 * Donut breakdown helpers: top-five aggregation, totals, and slice shaping.
 * Totals use signed expense contributions so centre, legend, and KPIs stay aligned.
 */
import type { CategoryBreakdownItem } from "@moneytrack/contracts";
import {
  assignStableColors,
  CHART_COLORS,
  CHART_OTHER_COLOR,
  INCOME_CHART_COLORS,
} from "@/lib/chart-colors";
import type { DonutFlow, DonutSlice } from "./types";

export const OTHER_SLICE_NAME = "אחר";

export function breakdownTotal(items: CategoryBreakdownItem[]): number {
  return items.reduce((sum, item) => sum + item.amountIls, 0);
}

export function aggregateTopFive(items: CategoryBreakdownItem[]): CategoryBreakdownItem[] {
  if (items.length <= 6) return [...items];

  const sorted = [...items].sort(
    (left, right) => Math.abs(right.amountIls) - Math.abs(left.amountIls),
  );
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const otherAmount = rest.reduce((sum, item) => sum + item.amountIls, 0);
  const otherCount = rest.reduce((sum, item) => sum + item.transactionCount, 0);

  const memberIds = rest
    .map((item) => item.categoryId)
    .filter((id): id is string => id != null);

  return [
    ...top,
    {
      categoryId: null,
      categoryName: OTHER_SLICE_NAME,
      amountIls: otherAmount,
      transactionCount: otherCount,
      drillDown: rest[0]?.drillDown ?? top[0]!.drillDown,
      memberIds,
    } as CategoryBreakdownItem & { memberIds: string[] },
  ];
}

function sliceColorKey(item: CategoryBreakdownItem, flow: DonutFlow): string {
  const identity = item.categoryId ?? item.categoryName;
  return `${flow}:${identity}`;
}

export function toDonutSlices(
  items: CategoryBreakdownItem[],
  flow: DonutFlow = "expense",
): DonutSlice[] {
  const aggregated = aggregateTopFive(items);
  const total = breakdownTotal(aggregated);

  const stableColors =
    flow === "income"
      ? assignStableColors(
          aggregated
            .filter((item) => item.categoryName !== OTHER_SLICE_NAME)
            .map((item) => sliceColorKey(item, flow)),
          INCOME_CHART_COLORS,
        )
      : null;

  return aggregated.map((item, index) => {
    const displayAmount = Math.abs(item.amountIls);
    const percent = total > 0 ? (displayAmount / total) * 100 : 0;
    const isOther = item.categoryName === OTHER_SLICE_NAME;
    const memberIds =
      isOther && "memberIds" in item ? (item as { memberIds?: string[] }).memberIds : undefined;
    const color = isOther
      ? CHART_OTHER_COLOR
      : flow === "income"
        ? (stableColors!.get(sliceColorKey(item, flow)) ?? INCOME_CHART_COLORS[0]!)
        : CHART_COLORS[index % CHART_COLORS.length]!;
    return {
      ...item,
      displayAmount,
      percent,
      color,
      memberIds,
    };
  });
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatYoYDelta(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${rounded}% מאשתקד`;
}

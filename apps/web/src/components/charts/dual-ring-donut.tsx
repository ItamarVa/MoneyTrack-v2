"use client";
/**
 * Dashboard dual-ring chart: outer expenses, inner salaries + other income.
 * Balance highlights render permanently via the Recharts Pie shape prop.
 */
import type { AnalysisFilter, BreakdownDimension, CategoryBreakdownItem } from "@moneytrack/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { drillDownToTransactionsUrl, entityDetailUrl } from "@/lib/analysis-filter";
import { entityIdForCategorySlice } from "@/lib/category-ids";
import { formatIls } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import he from "@/locales/he.json";
import { formatPercent, OTHER_SLICE_NAME } from "./breakdown-utils";
import { buildDualRingSlices } from "./dual-ring-slices";
import { DimensionSwitcher } from "./dimension-switcher";
import { DonutDataTable } from "./donut-data-table";
import { DonutLegend } from "./donut-legend";
import { sliceKey, useDonutSelection } from "./donut-selection";
import { DonutSelectionReadout } from "./donut-selection-readout";
import { renderSelectableSector } from "./donut-sector";
import { DrillBreadcrumb } from "./drill-breadcrumb";
import type { DonutSlice, DualRingDonutProps } from "./types";
import { INCOME_DIMENSIONS } from "./types";
import { useReducedMotion } from "./use-reduced-motion";
function periodFromFilter(filter: DualRingDonutProps["filter"]): string {
  const anchor = filter.dateFrom ?? filter.dateTo;
  if (!anchor) return "all"; // unbounded filter: keep the entity page in all-period mode
  const [year, month] = anchor.split("-");
  return `${year}-${month}`;
}
function isOtherSlice(slice: DonutSlice): boolean {
  return slice.categoryName === OTHER_SLICE_NAME && Boolean(slice.memberIds?.length);
}
function incomeMemberFilter(
  dimension: BreakdownDimension,
  memberIds: string[],
  baseFilter: AnalysisFilter,
): AnalysisFilter {
  switch (dimension) {
    case "merchant":
      return { ...baseFilter, merchantIds: memberIds };
    case "account":
      return { ...baseFilter, accountIds: memberIds };
    case "person":
      return { ...baseFilter, personIds: memberIds };
    case "category":
      return { ...baseFilter, categoryIds: memberIds };
    default:
      return baseFilter;
  }
}
function formatTransactionCount(count: number, ring: "inner" | "outer" | undefined): string {
  if (ring === "inner") {
    return count === 1 ? "1 תשלום" : `${count} תשלומים`;
  }
  return count === 1 ? "1 עסקה" : `${count} עסקאות`;
}
function DonutTooltip({
  active,
  payload,
  totalIncomeIls,
  totalExpensesIls,
  innerMeta,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DonutSlice; value?: number }>;
  totalIncomeIls: number;
  totalExpensesIls: number;
  innerMeta: Record<string, { personName: string | null }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const slice = payload[0]?.payload;
  if (!slice) {
    return null;
  }
  const ring = slice.ring;
  const isInner = ring === "inner";
  const sideLabel = isInner ? "הכנסה" : "הוצאה";
  const sideTotal = isInner ? totalIncomeIls : totalExpensesIls;
  const sidePercent =
    sideTotal > 0 ? (slice.displayAmount / sideTotal) * 100 : 0;
  const sidePercentLabel = isInner ? "% מההכנסות" : "% מההוצאות";
  const personName =
    isInner && slice.categoryId ? innerMeta[slice.categoryId]?.personName : null;
  return (
    <div
      dir="rtl"
      className="hidden max-w-xs rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-lg md:block"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-text-primary">{slice.categoryName}</p>
        <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
          {sideLabel}
        </span>
      </div>
      <p className="mt-1 text-text-secondary">
        <bdi dir="ltr">{formatIls(Number(payload[0]?.value ?? slice.displayAmount))}</bdi>
      </p>
      {slice.isBalanceHighlight && slice.explanation ? (
        <p className="mt-1 text-xs text-text-muted">{slice.explanation}</p>
      ) : (
        <p className="mt-1 text-xs text-text-muted">
          {formatPercent(sidePercent)} {sidePercentLabel}
        </p>
      )}
      {!slice.isBalanceHighlight && slice.transactionCount > 0 ? (
        <p className="mt-0.5 text-xs text-text-muted">
          {formatTransactionCount(slice.transactionCount, ring)}
        </p>
      ) : null}
      {personName ? (
        <p className="mt-0.5 text-xs text-text-muted">בעל/ת: {personName}</p>
      ) : null}
    </div>
  );
}
function localizeItems(items: CategoryBreakdownItem[]): CategoryBreakdownItem[] {
  return items.map((item) => ({
    ...item,
    categoryName: localizeBreakdownLabel(item.categoryName),
  }));
}
export function DualRingDonut({
  outerItems,
  innerItems,
  filter,
  dimension,
  periodLabel,
  breadcrumbs,
  onNavigate,
  balance,
  totalIncomeIls,
  totalExpensesIls,
  showMonthNav = true,
  showDimensionSwitcher = true,
  hideInnerRing = false,
  navigateOnSlice = true,
  innerMeta = {},
  incomeDimension = "salary",
  onIncomeDimensionChange,
}: DualRingDonutProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [showTable, setShowTable] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [otherMemberIds, setOtherMemberIds] = useState<string[] | null>(null);
  const localizedOuter = useMemo(() => localizeItems(outerItems), [outerItems]);
  const localizedInner = useMemo(() => localizeItems(innerItems), [innerItems]);
  const displayOuter = useMemo(() => {
    if (!otherExpanded || !otherMemberIds?.length) {
      return localizedOuter;
    }
    const idSet = new Set(otherMemberIds);
    return localizedOuter.filter((item) => item.categoryId != null && idSet.has(item.categoryId));
  }, [localizedOuter, otherExpanded, otherMemberIds]);
  const { outerSlices, innerSlices } = useMemo(
    () =>
      buildDualRingSlices({
        outerItems: displayOuter,
        innerItems: localizedInner,
        balance,
        hideInnerRing: hideInnerRing || otherExpanded,
      }),
    [balance, displayOuter, hideInnerRing, localizedInner, otherExpanded],
  );
  const netIls = totalIncomeIls - totalExpensesIls;
  const centreLabel =
    netIls > 0 ? "עודף" : netIls < 0 ? "חוסר" : "מאוזן";
  const centreAmountClass =
    netIls > 0
      ? "text-chart-surplus"
      : netIls < 0
        ? "text-chart-deficit"
        : "text-text-primary";
  const centreAmount =
    netIls !== 0 ? formatIls(Math.abs(netIls)) : balance.caption ?? formatIls(0);
  const collapseOther = () => {
    setOtherExpanded(false);
    setOtherMemberIds(null);
    clearSelection();
  };
  const canDrillSlice = (slice: DonutSlice): boolean => {
    if (slice.isBalanceHighlight) {
      return false;
    }
    if (slice.ring === "inner") {
      if (!navigateOnSlice) {
        return false;
      }
      if (isOtherSlice(slice)) {
        return incomeDimension !== "salary" && Boolean(slice.memberIds?.length);
      }
      return Boolean(slice.drillDown);
    }
    if (isOtherSlice(slice)) {
      return true;
    }
    return (
      Boolean(entityIdForCategorySlice(dimension, slice.categoryId)) &&
      navigateOnSlice &&
      dimension !== "transaction" &&
      dimension !== "salary" &&
      dimension !== "month"
    );
  };

  const drillSlice = (slice: DonutSlice) => {
    if (slice.ring === "inner") {
      if (isOtherSlice(slice)) {
        router.push(
          drillDownToTransactionsUrl(
            incomeMemberFilter(incomeDimension, slice.memberIds ?? [], filter),
            { kinds: ["income"] },
          ),
        );
        return;
      }
      router.push(drillDownToTransactionsUrl(slice.drillDown.filter, { kinds: ["income"] }));
      return;
    }
    if (isOtherSlice(slice)) {
      setOtherExpanded(true);
      setOtherMemberIds(slice.memberIds ?? []);
      return;
    }
    const entityId = entityIdForCategorySlice(dimension, slice.categoryId);
    if (entityId && dimension !== "transaction") {
      router.push(entityDetailUrl(dimension, entityId, periodFromFilter(filter)));
    }
  };

  const {
    selectedKey,
    tap: tapSlice,
    clear: clearSelection,
    onChartBackgroundClick,
    containerRef,
  } = useDonutSelection({ canDrill: canDrillSlice, onDrill: drillSlice });

  useEffect(() => {
    setOtherExpanded(false);
    setOtherMemberIds(null);
    clearSelection();
  }, [outerItems, innerItems, dimension, filter.dateFrom, filter.dateTo, clearSelection]);

  const showIncomeLegend = !hideInnerRing && !otherExpanded && innerSlices.length > 0;
  const hasOuterData = outerSlices.some((slice) => !slice.isBalanceHighlight);
  const hasInnerData = innerSlices.some((slice) => !slice.isBalanceHighlight);
  const allSlices = [...outerSlices, ...innerSlices];
  const selectedSlice = selectedKey ? (allSlices.find((slice) => sliceKey(slice) === selectedKey) ?? null) : null;
  const selectedIsInner = selectedSlice?.ring === "inner";
  const selectedSideTotal = selectedIsInner ? totalIncomeIls : totalExpensesIls;
  const selectedSidePercent =
    selectedSlice && selectedSideTotal > 0 ? (selectedSlice.displayAmount / selectedSideTotal) * 100 : 0;
  const selectedPerson =
    selectedSlice && selectedIsInner && selectedSlice.categoryId
      ? innerMeta[selectedSlice.categoryId]?.personName
      : null;
  const selectedDetail = selectedSlice && !selectedSlice.isBalanceHighlight
    ? [
        selectedSlice.transactionCount > 0
          ? formatTransactionCount(selectedSlice.transactionCount, selectedSlice.ring)
          : null,
        selectedPerson ? `בעל/ת: ${selectedPerson}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const renderShape = (props: PieSectorDataItem) =>
    renderSelectableSector(props, {
      selectedKey,
      onActivate: tapSlice,
      idleStroke: "var(--surface-card)",
      idleStrokeWidth: 1,
    });

  const tooltipRenderer = (props: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload?: DonutSlice; value?: number }>;
  }) => (
    <DonutTooltip
      {...props}
      totalIncomeIls={totalIncomeIls}
      totalExpensesIls={totalExpensesIls}
      innerMeta={innerMeta}
    />
  );
  return (
    <section
      ref={containerRef as RefObject<HTMLElement>}
      aria-label="הוצאות והכנסות"
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-text-primary">הוצאות והכנסות</h2>
          {showMonthNav ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <button
                type="button"
                aria-label="חודש קודם"
                onClick={() => onNavigate({ type: "month", direction: -1 })}
                className="rounded border border-border-subtle px-2 py-1 hover:border-brand-blue-500/40"
              >
                ‹
              </button>
              <span>{periodLabel || formatMonthYear(filter.dateTo ?? filter.dateFrom ?? "2026-08")}</span>
              <button
                type="button"
                aria-label="חודש הבא"
                onClick={() => onNavigate({ type: "month", direction: 1 })}
                className="rounded border border-border-subtle px-2 py-1 hover:border-brand-blue-500/40"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
        {balance.caption && netIls === 0 ? (
          <p className="text-center text-sm text-text-muted">{balance.caption}</p>
        ) : null}
        <DrillBreadcrumb segments={breadcrumbs} onSelect={(segment) => onNavigate({ type: "breadcrumb", segment })} />
        {showDimensionSwitcher && dimension !== "transaction" && !otherExpanded ? (
          <DimensionSwitcher
            value={dimension}
            onChange={(next) => onNavigate({ type: "dimension", dimension: next })}
          />
        ) : null}
        {otherExpanded ? (
          <button
            type="button"
            onClick={collapseOther}
            className="text-sm text-brand-blue-500 hover:underline"
          >
            ← חזרה לסיכום
          </button>
        ) : null}
      </div>
      {!hasOuterData && !hasInnerData && totalIncomeIls === 0 && totalExpensesIls === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          אין נתונים לתקופה שנבחרה
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="w-full max-w-96 self-start">
          <div className="relative aspect-square w-full" dir="ltr" onClick={onChartBackgroundClick}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={outerSlices}
                  dataKey="displayAmount"
                  nameKey="categoryName"
                  innerRadius="68%"
                  outerRadius="88%"
                  paddingAngle={1}
                  isAnimationActive={!reducedMotion}
                  shape={renderShape}
                  onClick={(segment) => tapSlice(segment.payload as DonutSlice)}
                  className="cursor-pointer outline-none"
                />
                {showIncomeLegend ? (
                  <Pie
                    data={innerSlices}
                    dataKey="displayAmount"
                    nameKey="categoryName"
                    innerRadius="46%"
                    outerRadius="62%"
                    paddingAngle={1}
                    isAnimationActive={!reducedMotion}
                    shape={renderShape}
                    onClick={(segment) => tapSlice(segment.payload as DonutSlice)}
                    className="cursor-pointer outline-none"
                  />
                ) : null}
                <Tooltip content={tooltipRenderer} wrapperStyle={{ zIndex: 30 }} />
              </PieChart>
            </ResponsiveContainer>
            <div
              dir="rtl"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              {selectedSlice ? (
                <div className="max-w-[44%] px-1">
                  <p className="line-clamp-2 break-words text-[11px] text-text-secondary">
                    {selectedSlice.categoryName}
                  </p>
                  <p className="font-display text-lg text-text-primary">
                    <bdi dir="ltr">{formatIls(selectedSlice.displayAmount)}</bdi>
                  </p>
                  {selectedSlice.isBalanceHighlight ? null : (
                    <p className="text-[11px] text-text-muted">{formatPercent(selectedSidePercent)}</p>
                  )}
                </div>
              ) : (
                <div className="max-w-[44%] px-1">
                  <p className="text-[11px] text-text-muted">{centreLabel}</p>
                  <p className={`font-display text-xl ${centreAmountClass}`}>
                    <bdi dir="ltr">{centreAmount}</bdi>
                  </p>
                  <div className="mt-1 space-y-0.5 text-[11px] text-text-muted">
                    <p>הוצאות <bdi dir="ltr">{formatIls(totalExpensesIls)}</bdi></p>
                    <p>הכנסות <bdi dir="ltr">{formatIls(totalIncomeIls)}</bdi></p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DonutSelectionReadout
            slice={selectedSlice}
            percent={selectedSidePercent}
            percentSuffix={selectedIsInner ? he.donutSelect.ofIncome : he.donutSelect.ofExpenses}
            detail={selectedDetail}
            drillLabel={
              selectedSlice && canDrillSlice(selectedSlice)
                ? selectedIsInner
                  ? he.donutSelect.showTransactions
                  : he.donutSelect.drill
                : null
            }
            onDrill={tapSlice}
            onClear={clearSelection}
          />
          </div>
          <div className={showIncomeLegend ? "grid gap-x-6 gap-y-4 sm:grid-cols-2" : "max-w-md"}>
            <div>
              <h3 className="mb-2 text-sm font-medium text-text-secondary">הוצאות</h3>
              <DonutLegend
                slices={outerSlices}
                selectedId={selectedKey}
                onSelect={tapSlice}
                dense
              />
            </div>
            {showIncomeLegend ? (
              <div>
                <h3 className="mb-2 text-sm font-medium text-text-secondary">הכנסות</h3>
                {onIncomeDimensionChange ? (
                  <div className="mb-3">
                    <DimensionSwitcher
                      value={incomeDimension}
                      onChange={onIncomeDimensionChange}
                      dimensions={INCOME_DIMENSIONS}
                      ariaLabel="מימד הכנסות"
                    />
                  </div>
                ) : null}
                <DonutLegend
                  slices={innerSlices}
                  selectedId={selectedKey}
                  onSelect={tapSlice}
                  dense
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
      {allSlices.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-muted">{he.donutSelect.hint}</p>
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:border-brand-blue-500/40"
          >
            {showTable ? "הסתר טבלה" : "טבלת נתונים"}
          </button>
        </div>
      ) : null}
      {showTable && allSlices.length > 0 ? (
        <div className="mt-4">
          <DonutDataTable slices={allSlices} total={balance.denominatorIls} flow="expense" />
        </div>
      ) : null}
    </section>
  );
}

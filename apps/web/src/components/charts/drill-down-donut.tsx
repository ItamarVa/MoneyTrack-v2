"use client";

/**
 * Drill-down donut: dimension switcher, centre total, legend, month navigator,
 * balance highlight sector, "אחר" in-place expansion, and entity-page navigation.
 */
import type { CategoryBreakdownItem } from "@moneytrack/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { entityDetailUrl } from "@/lib/analysis-filter";
import { entityIdForCategorySlice } from "@/lib/category-ids";
import { formatIls } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { balanceColor, GlowingSector } from "./balance-sector";
import { breakdownTotal, OTHER_SLICE_NAME, toDonutSlices } from "./breakdown-utils";
import { DimensionSwitcher } from "./dimension-switcher";
import { DonutDataTable } from "./donut-data-table";
import { DonutLegend } from "./donut-legend";
import { DrillBreadcrumb } from "./drill-breadcrumb";
import type { DonutFlow, DonutSlice, DrillDownDonutProps } from "./types";
import { useReducedMotion } from "./use-reduced-motion";

function periodFromFilter(filter: DrillDownDonutProps["filter"]): string {
  const anchor = filter.dateFrom ?? filter.dateTo ?? new Date().toISOString().slice(0, 10);
  const [year, month] = anchor.split("-");
  return `${year}-${month}`;
}

function isOtherSlice(slice: DonutSlice): boolean {
  return slice.categoryName === OTHER_SLICE_NAME && Boolean(slice.memberIds?.length);
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DonutSlice; value?: number }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const slice = payload[0]?.payload;
  if (!slice) {
    return null;
  }
  return (
    <div
      dir="rtl"
      className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
    >
      <p className="font-medium text-text-primary">{slice.categoryName}</p>
      <p className="text-text-secondary">
        <bdi dir="ltr">{formatIls(Number(payload[0]?.value ?? slice.displayAmount))}</bdi>
      </p>
    </div>
  );
}

function sliceKey(slice: DonutSlice | CategoryBreakdownItem): string {
  if ("isBalanceHighlight" in slice && slice.isBalanceHighlight) {
    return `balance-${slice.balanceKind ?? "highlight"}`;
  }
  return slice.categoryId ?? slice.categoryName;
}

function flowEmptyMessage(flow: DonutFlow): string {
  return flow === "income" ? "אין הכנסות לתקופה שנבחרה" : "אין הוצאות לתקופה שנבחרה";
}

function flowCentreLabel(flow: DonutFlow): string {
  return flow === "income" ? "סך הכנסות" : "סך הוצאות";
}

function centreSubtitle(flow: DonutFlow, ringTotalIls: number, hasHighlight: boolean): string | null {
  if (!hasHighlight || ringTotalIls <= 0) {
    return null;
  }
  const otherSide = flow === "expense" ? "הכנסות" : "הוצאות";
  return `${flowCentreLabel(flow)} · מתוך ${formatIls(ringTotalIls)} ${otherSide}`;
}

function appendBalanceSlice(
  categorySlices: DonutSlice[],
  balance: DrillDownDonutProps["balance"],
  level: DrillDownDonutProps["level"],
): DonutSlice[] {
  if (level !== 1 || !balance?.highlight) {
    return categorySlices;
  }

  const ringTotal = balance.ringTotalIls;
  const recalculated = categorySlices.map((slice) => ({
    ...slice,
    percent: ringTotal > 0 ? (slice.displayAmount / ringTotal) * 100 : 0,
  }));
  const highlight = balance.highlight;

  return [
    ...recalculated,
    {
      categoryId: null,
      categoryName: highlight.label,
      amountIls: highlight.amountIls,
      transactionCount: 0,
      drillDown: recalculated[0]?.drillDown ?? categorySlices[0]!.drillDown,
      displayAmount: highlight.amountIls,
      percent: ringTotal > 0 ? (highlight.amountIls / ringTotal) * 100 : 0,
      color: balanceColor(highlight.kind),
      isBalanceHighlight: true,
      balanceKind: highlight.kind,
      explanation: highlight.explanation,
    },
  ];
}

function renderDonutSector(
  props: PieSectorDataItem,
  selectedKey: string | null,
): ReactElement {
  const slice = props.payload as DonutSlice;
  const selected = selectedKey === sliceKey(slice);
  if (slice.isBalanceHighlight) {
    return (
      <GlowingSector
        {...props}
        balanceKind={slice.balanceKind}
        fill={slice.color}
      />
    );
  }
  return (
    <Sector
      {...props}
      fill={slice.color}
      stroke={selected ? "var(--brand-orange-500)" : undefined}
      strokeWidth={selected ? 2 : 0}
    />
  );
}

function EmptyChip({
  label,
  amountIls,
  kind,
}: {
  label: string;
  amountIls: number;
  kind: "surplus" | "deficit";
}) {
  const toneClass =
    kind === "surplus"
      ? "border-chart-surplus/40 bg-chart-surplus/10 text-chart-surplus"
      : "border-chart-deficit/40 bg-chart-deficit/10 text-chart-deficit";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${toneClass}`}
    >
      {label}
      <bdi dir="ltr">{formatIls(amountIls)}</bdi>
    </span>
  );
}

export function DrillDownDonut({
  items,
  filter,
  dimension,
  periodLabel,
  level,
  breadcrumbs,
  level3Transactions: _level3Transactions,
  onNavigate,
  navigateOnSlice = true,
  persistToUrl: _persistToUrl,
  flow = "expense",
  balance,
  balancedCaption,
  showMonthNav = true,
  showDimensionSwitcher = true,
  breadcrumbLastClickable = false,
  title,
  narrowLayout = false,
}: DrillDownDonutProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [showTable, setShowTable] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [otherMemberIds, setOtherMemberIds] = useState<string[] | null>(null);

  useEffect(() => {
    setOtherExpanded(false);
    setOtherMemberIds(null);
    setSelectedKey(null);
  }, [items, dimension, filter.dateFrom, filter.dateTo]);

  const localizedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        categoryName: localizeBreakdownLabel(item.categoryName),
      })),
    [items],
  );

  const displayItems = useMemo(() => {
    if (!otherExpanded || !otherMemberIds?.length) {
      return localizedItems;
    }
    const idSet = new Set(otherMemberIds);
    return localizedItems.filter((item) => item.categoryId != null && idSet.has(item.categoryId));
  }, [localizedItems, otherExpanded, otherMemberIds]);

  const categorySlices = useMemo(() => toDonutSlices(displayItems, flow), [displayItems, flow]);
  const categoryTotal = useMemo(() => breakdownTotal(displayItems), [displayItems]);
  const slices = useMemo(
    () => (otherExpanded ? categorySlices : appendBalanceSlice(categorySlices, balance, level)),
    [balance, categorySlices, level, otherExpanded],
  );
  const ringTotal = otherExpanded ? categoryTotal : (balance?.ringTotalIls ?? categoryTotal);
  const sectionTitle = title ?? (flow === "income" ? "מאין מגיע הכסף" : "לאן הולך הכסף");

  const collapseOther = () => {
    setOtherExpanded(false);
    setOtherMemberIds(null);
    setSelectedKey(null);
  };

  const handleSliceSelect = (slice: DonutSlice) => {
    if (slice.isBalanceHighlight) {
      return;
    }

    if (isOtherSlice(slice)) {
      setOtherExpanded(true);
      setOtherMemberIds(slice.memberIds ?? []);
      setSelectedKey(sliceKey(slice));
      return;
    }

    const entityId = entityIdForCategorySlice(dimension, slice.categoryId);
    if (entityId) {
      if (!navigateOnSlice) {
        onNavigate({ type: "slice", item: slice });
        return;
      }
      if (dimension !== "transaction") {
        router.push(entityDetailUrl(dimension, entityId, periodFromFilter(filter)));
      }
      return;
    }

    setSelectedKey(sliceKey(slice));
  };

  const showEmptyRing = balance && !balance.showRing && !otherExpanded;
  const customEmpty = balance?.emptyMessage;
  const hasCategoryData = categorySlices.length > 0;

  return (
    <section
      aria-label={flow === "income" ? "הכנסות לפי מימד" : "הוצאות לפי מימד"}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-text-primary">{sectionTitle}</h2>
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
        {balancedCaption ? (
          <p className="text-center text-sm text-text-muted">{balancedCaption}</p>
        ) : null}
        <DrillBreadcrumb
          segments={breadcrumbs}
          lastSegmentClickable={breadcrumbLastClickable}
          onSelect={(segment) => onNavigate({ type: "breadcrumb", segment })}
        />
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

      {showEmptyRing ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-border-subtle px-4 py-16 text-center">
          <p className="text-sm text-text-muted">{customEmpty}</p>
          {balance.emptyChip ? (
            <EmptyChip
              label={balance.emptyChip.label}
              amountIls={balance.emptyChip.amountIls}
              kind={balance.emptyChip.kind}
            />
          ) : null}
        </div>
      ) : !hasCategoryData ? (
        <p className="rounded-lg border border-border-subtle px-4 py-16 text-center text-sm text-text-muted">
          {flowEmptyMessage(flow)}
        </p>
      ) : (
        <div
          className={[
            "grid gap-6",
            narrowLayout
              ? "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
              : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
          ].join(" ")}
        >
          <div
            className={[
              "relative min-h-80",
              narrowLayout
                ? "mx-auto aspect-square w-full max-w-96 lg:mx-0 lg:max-w-none lg:aspect-auto"
                : "",
            ].join(" ")}
            dir="ltr"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={slices}
                  dataKey="displayAmount"
                  nameKey="categoryName"
                  innerRadius="58%"
                  outerRadius="84%"
                  paddingAngle={2}
                  isAnimationActive={!reducedMotion}
                  shape={(props: PieSectorDataItem) => renderDonutSector(props, selectedKey)}
                  onClick={(segment) => handleSliceSelect(segment.payload as DonutSlice)}
                  className="cursor-pointer outline-none"
                />
                <Tooltip content={DonutTooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div
              dir="rtl"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <p className="font-display text-2xl text-text-primary">
                <bdi dir="ltr">{formatIls(categoryTotal)}</bdi>
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {centreSubtitle(flow, ringTotal, Boolean(balance?.highlight)) ?? flowCentreLabel(flow)}
              </p>
            </div>
          </div>

          <DonutLegend
            slices={slices}
            selectedId={selectedKey}
            onSelect={handleSliceSelect}
          />
        </div>
      )}

      {hasCategoryData && !showEmptyRing ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-muted">לחצו על פרוסה או שורה לפירוט</p>
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

      {showTable && hasCategoryData && !showEmptyRing ? (
        <div className="mt-4">
          <DonutDataTable slices={slices} total={ringTotal} flow={flow} />
        </div>
      ) : null}
    </section>
  );
}

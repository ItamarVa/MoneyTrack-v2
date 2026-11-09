"use client";

/**
 * Credit page: 12 stacked monthly bars (top 5 top-level categories + other) for the card scope.
 * Fetches its own 5-year trend once per filter (basis/cards/dimension) and shows a 12-month window of it: default ends at the latest
 * data month, arrows page by 12. Selecting a month (bar tap / header) only highlights it, paging the window only if it fell outside.
 * Gotchas: the chart box needs a definite height; the month total is drawn by a near-zero-height
 * anchor bar (value 1 ILS: a 0 value renders no rect, so no label) on top of the stack; expense amounts are shown without a minus sign.
 * Data shaping lives in credit-monthly-utils.ts.
 */
import type { BreakdownDimension, Category, DateBasis, TrendPoint } from "@moneytrack/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DimensionSwitcher } from "@/components/charts/dimension-switcher";
import { useReducedMotion } from "@/components/charts/use-reduced-motion";
import { currentMonthPeriod, useGlobalPeriod, type GlobalPeriod } from "@/components/period/period-context";
import { Icon } from "@/components/ui/icon";
import { SkeletonPanel } from "@/components/ui/skeleton";
import { fetchCategoryTrend } from "@/lib/api-client";
import { CHART_OTHER_COLOR, chartColor } from "@/lib/chart-colors";
import { formatIls, formatIlsCompact } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { fillTemplate } from "@/components/category/category-options";
import {
  buildMonthlyData,
  canPageForward,
  keepSelectedVisible,
  latestDataPeriod,
  monthOverMonthPct,
  OTHER_KEY,
  pageWindowEnd,
  periodFromChartClick,
  shiftMonth,
  windowEndingAt,
  type MonthlyData,
} from "./credit-monthly-utils";

const copy = he.creditPage.monthly;
const PAGE_TOP_ID = "credit-page-top";
const ANCHOR = "labelAnchor";
const ANCHOR_VALUE = 1;
const NARROW_PX = 480;
const RANGE_MONTHS = 60;
const DIMENSIONS: BreakdownDimension[] = ["category", "person", "card"];
type TrendDimension = "category" | "person" | "card";

type Props = {
  period: GlobalPeriod;
  basis: DateBasis;
  cardIds: readonly string[];
  categories: readonly Category[];
};

function shortMonth(period: string): string {
  const [year = "", month = ""] = period.split("-");
  return `${month}/${year.slice(2)}`;
}

export function CreditMonthlyChart({ period, basis, cardIds, categories }: Props) {
  const reducedMotion = useReducedMotion();
  const { setPeriod } = useGlobalPeriod();
  const boxRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [points, setPoints] = useState<TrendPoint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [dimension, setDimension] = useState<TrendDimension>("category");

  const cardKey = cardIds.join(",");
  const periodRef = useRef(period);
  periodRef.current = period;
  const [windowEnd, setWindowEnd] = useState<string | null>(null);
  const latest = useMemo(() => (points ? latestDataPeriod(points) : null), [points]);
  const rangeEnd = useMemo(() => shiftMonth(currentMonthPeriod(), 1), []);
  const rangeStart = shiftMonth(rangeEnd, -(RANGE_MONTHS - 1));
  const window12 = useMemo(() => windowEndingAt(windowEnd ?? rangeEnd), [windowEnd, rangeEnd]);
  const selected = period === "all" ? window12.months[11]! : period;

  useEffect(() => {
    if (cardKey === "") return;
    let cancelled = false;
    setPoints(null);
    setWindowEnd(null);
    setFailed(false);
    void fetchCategoryTrend(
      {
        dateBasis: basis,
        accountIds: cardKey.split(","),
        dateFrom: `${rangeStart}-01`,
        dateTo: windowEndingAt(rangeEnd).dateTo,
      },
      dimension,
    )
      .then((response) => {
        if (cancelled) return;
        const end = latestDataPeriod(response.points) ?? currentMonthPeriod();
        setWindowEnd(periodRef.current === "all" ? end : keepSelectedVisible(end, periodRef.current));
        setPoints(response.points);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [basis, cardKey, dimension, rangeStart, rangeEnd]);

  useEffect(() => {
    if (period === "all") return;
    setWindowEnd((end) => (end === null ? end : keepSelectedVisible(end, period)));
  }, [period]);

  const data: MonthlyData | null = useMemo(
    () => (points ? buildMonthlyData(points, categories, window12.months, dimension === "category") : null),
    [points, categories, window12, dimension],
  );

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setNarrow(width < NARROW_PX);
    });
    observer.observe(element);
    return () => observer.disconnect();
  });

  // Whole-column tap selects the month, then brings the page's breakdown into view (chart-originated only).
  const selectFromChart = (target: string | null) => {
    if (!target) return;
    setPeriod(target);
    requestAnimationFrame(() =>
      document.getElementById(PAGE_TOP_ID)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }),
    );
  };

  if (failed) return null;
  const switcher = (
    <div className="mt-3">
      <DimensionSwitcher
        value={dimension}
        onChange={(next) => setDimension(next as TrendDimension)}
        dimensions={DIMENSIONS}
        ariaLabel={copy.dimensionAria}
      />
    </div>
  );
  if (!data) {
    return (
      <section aria-label={copy.ariaLabel} className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-4">
        <h2 className="font-display text-lg text-text-primary">{copy.title}</h2>
        {switcher}
        <div className="mt-3"><SkeletonPanel lines={5} /></div>
      </section>
    );
  }

  const rows = data.rows;
  const end = window12.months[11]!;
  const canBack = window12.months[0]! > rangeStart;
  const canForward = canPageForward(end, latest);
  const arrowClass =
    "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-text-primary hover:bg-surface-elevated disabled:opacity-40";
  const pager = (
    <div className="mt-3 flex items-center justify-between gap-2">
      {/* RTL: the first button sits on the right and goes back in time. */}
      <button type="button" aria-label={copy.prevMonths} disabled={!canBack} onClick={() => setWindowEnd(pageWindowEnd(end, -1))} className={arrowClass}>
        <Icon icon={ChevronRight} size={20} />
      </button>
      <span className="text-sm text-text-secondary" dir="ltr">
        {shortMonth(window12.months[0]!)} – {shortMonth(end)}
      </span>
      <button type="button" aria-label={copy.nextMonths} disabled={!canForward} onClick={() => setWindowEnd(pageWindowEnd(end, 1))} className={arrowClass}>
        <Icon icon={ChevronLeft} size={20} />
      </button>
    </div>
  );
  const hasData = rows.some((row) => row.total !== 0);
  const nameOf = (key: string, fallback: string) => (key === OTHER_KEY ? copy.other : fallback);
  const colorOf = (index: number, key: string) => (key === OTHER_KEY ? CHART_OTHER_COLOR : chartColor(index));
  const chartRows = rows.map((row) => ({
    period: row.period,
    total: row.total,
    [ANCHOR]: ANCHOR_VALUE,
    ...Object.fromEntries(data.series.map((s) => [s.key, row.values[s.key] ?? 0])),
  }));

  const selectedIndex = rows.findIndex((row) => row.period === selected);
  const selectedRow = rows[selectedIndex];
  const pct = selectedRow ? monthOverMonthPct(selectedRow.total, rows[selectedIndex - 1]?.total) : null;
  const changeLine =
    pct === null ? null : pct === 0 ? copy.changeSame : fillTemplate(pct > 0 ? copy.changeUp : copy.changeDown, { pct: String(Math.abs(pct)) });

  const renderTotal = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const index = props.index ?? 0;
    const row = rows[index];
    if (!row || row.total === 0) return null;
    if (narrow && index % 2 !== (selectedIndex % 2 + 2) % 2 && index !== selectedIndex) return null;
    return (
      <text
        x={Number(props.x ?? 0) + Number(props.width ?? 0) / 2}
        y={Number(props.y ?? 0) - 4}
        textAnchor="middle"
        fontSize={10}
        fontWeight={index === selectedIndex ? 700 : 400}
        fill="var(--text-secondary)"
      >
        {formatIlsCompact(Math.abs(row.total)).replace(" ₪", "")}
      </text>
    );
  };

  return (
    <section aria-label={copy.ariaLabel} className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-4">
      <h2 className="font-display text-lg text-text-primary">{copy.title}</h2>
      {switcher}
      {pager}
      {selectedRow ? (
        <p className="mt-1 text-sm text-text-secondary">
          {fillTemplate(copy.summary, { month: formatMonthYear(selected), total: formatIls(Math.abs(selectedRow.total)) })}
          {changeLine ? <span className="text-text-muted"> · {changeLine}</span> : null}
        </p>
      ) : null}

      {!hasData ? (
        <p className="mt-4 rounded-lg border border-border-subtle px-4 py-12 text-center text-sm text-text-muted">{copy.empty}</p>
      ) : (
        <div dir="ltr" ref={boxRef} className="mt-3 h-72 w-full min-w-0 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              accessibilityLayer
              margin={{ top: 28 }}
              style={{ cursor: "pointer" }}
              onClick={(state) => selectFromChart(periodFromChartClick(window12.months, state))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="period" tickFormatter={shortMonth} interval={narrow ? 1 : 0} fontSize={11} />
              <YAxis tickFormatter={(value) => formatIlsCompact(Number(value)).replace(" ₪", "")} width={44} fontSize={11} />
              <Tooltip
                content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Record<string, number | string> }> }) => {
                  const row = payload?.[0]?.payload;
                  if (!active || !row) return null;
                  return (
                    <div dir="rtl" className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm">
                      <p className="font-medium text-text-primary">{formatMonthYear(String(row.period))}</p>
                      {data.series.map((s, i) =>
                        Number(row[s.key]) !== 0 ? (
                          <p key={s.key} className="text-text-secondary">
                            <span aria-hidden style={{ color: colorOf(i, s.key) }}>■ </span>
                            {nameOf(s.key, s.name)}: <bdi dir="ltr">{formatIls(Math.abs(Number(row[s.key])))}</bdi>
                          </p>
                        ) : null,
                      )}
                      <p className="mt-1 font-medium text-text-primary">
                        {copy.total}: <bdi dir="ltr">{formatIls(Math.abs(Number(row.total)))}</bdi>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ direction: "rtl" }}
                formatter={(value: string) => {
                  const s = data.series.find((item) => item.key === value);
                  return s ? nameOf(s.key, s.name) : value;
                }}
              />
              {data.series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="month"
                  fill={colorOf(i, s.key)}
                  isAnimationActive={!reducedMotion}
                >
                  {chartRows.map((row) => (
                    <Cell key={row.period} fill={colorOf(i, s.key)} fillOpacity={row.period === selected ? 1 : 0.55} />
                  ))}
                </Bar>
              ))}
              <Bar dataKey={ANCHOR} stackId="month" fill="transparent" stroke="none" legendType="none" isAnimationActive={false} tooltipType="none">
                <LabelList dataKey={ANCHOR} content={renderTotal} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">{copy.tapHint}</p>
        {hasData ? (
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary hover:border-brand-blue-500/40"
          >
            {showTable ? copy.hideTable : copy.showTable}
          </button>
        ) : null}
      </div>

      {showTable && hasData ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">{copy.tableCaption}</caption>
            <thead>
              <tr className="text-text-muted">
                <th scope="col" className="px-2 py-1 text-start font-medium">{copy.monthColumn}</th>
                {data.series.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-1 text-start font-medium">{nameOf(s.key, s.name)}</th>
                ))}
                <th scope="col" className="px-2 py-1 text-start font-medium">{copy.total}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.period} className="border-t border-border-subtle text-text-secondary">
                  <th scope="row" className="px-2 py-1 text-start font-normal">{formatMonthYear(row.period)}</th>
                  {data.series.map((s) => (
                    <td key={s.key} className="px-2 py-1"><bdi dir="ltr">{formatIls(Math.abs(row.values[s.key] ?? 0))}</bdi></td>
                  ))}
                  <td className="px-2 py-1 font-medium text-text-primary"><bdi dir="ltr">{formatIls(Math.abs(row.total))}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

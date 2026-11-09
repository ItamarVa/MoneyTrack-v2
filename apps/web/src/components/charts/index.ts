/**
 * Shared chart components for dashboard and analysis (Wave 1 Track G).
 */
export { DrillDownDonut } from "./drill-down-donut";
export { DualRingDonut } from "./dual-ring-donut";
export { computeDualRingBalance } from "./dual-ring-balance";
export { MonthlyBarsPanel } from "./monthly-bars-panel";
export { ChartsFixtureShell } from "./charts-fixture-shell";
export { DimensionSwitcher } from "./dimension-switcher";
export { aggregateTopFive, breakdownTotal, toDonutSlices } from "./breakdown-utils";
export {
  alignYearOverYear,
  buildYoYSummaryLine,
  computeTwelveMonthExpenseAverage,
  hasPriorYearData,
} from "./monthly-utils";
export {
  FIXTURE_CATEGORY_BREAKDOWN,
  FIXTURE_MONTHLY_SERIES,
  FIXTURE_PERIOD_LABEL,
  FIXTURE_TREND_POINTS,
  fixtureBreakdownFor,
} from "./fixtures/chart-fixtures";
export type {
  BreadcrumbSegment,
  DrillDownDonutProps,
  DrillLevel,
  DrillNavigateAction,
  DualRingDonutProps,
  DonutSlice,
  MonthlyBarsMode,
  MonthlyBarsPanelProps,
  YearOverYearRow,
} from "./types";

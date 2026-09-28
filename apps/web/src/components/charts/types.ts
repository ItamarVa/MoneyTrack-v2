/**
 * Shared chart panel types for drill-down donut and monthly bars.
 * Wave 1 Track G — consumed by dashboard (H) and analysis (I) in Wave 2.
 */
import type {
  AnalysisFilter,
  BreakdownDimension,
  CategoryBreakdownItem,
  DashboardRecentTransaction,
  MonthlySeriesPoint,
  TrendPoint,
} from "@moneytrack/contracts";
export type BalanceSliceKind = "surplus" | "deficit";

export type BalanceHighlightSlice = {
  kind: BalanceSliceKind;
  label: "עודף" | "חוסר";
  amountIls: number;
  explanation: string;
};

export type RingEmptyChip = {
  kind: BalanceSliceKind;
  label: "עודף" | "חוסר";
  amountIls: number;
};

export type RingBalance = {
  flow: "expense" | "income";
  ringTotalIls: number;
  highlight: BalanceHighlightSlice | null;
  showRing: boolean;
  emptyMessage: string | null;
  emptyChip: RingEmptyChip | null;
};

/** UI-only ring dimension; contracts BreakdownDimension stays unchanged. */
export type RingDimension = BreakdownDimension | "transaction";

export type DrillLevel = 1 | 2 | 3;

export type BreadcrumbSegment = {
  label: string;
  level: DrillLevel;
  filter: AnalysisFilter;
  dimension: BreakdownDimension;
};

export type DonutFlow = "expense" | "income";

export type DonutSlice = CategoryBreakdownItem & {
  displayAmount: number;
  percent: number;
  color: string;
  memberIds?: string[];
  ring?: "inner" | "outer";
  isBalanceHighlight?: boolean;
  balanceKind?: "surplus" | "deficit";
  explanation?: string;
};

export type DualRingBalanceHighlight = {
  ring: "inner" | "outer";
  kind: "surplus" | "deficit";
  label: "עודף" | "חוסר";
  amountIls: number;
  explanation: string;
};

export type DualRingBalance = {
  denominatorIls: number;
  highlight: DualRingBalanceHighlight | null;
  caption: string | null;
};

export type DualRingDonutProps = {
  outerItems: CategoryBreakdownItem[];
  innerItems: CategoryBreakdownItem[];
  filter: AnalysisFilter;
  dimension: RingDimension;
  periodLabel: string;
  breadcrumbs: BreadcrumbSegment[];
  onNavigate: (action: DrillNavigateAction) => void;
  balance: DualRingBalance;
  totalIncomeIls: number;
  totalExpensesIls: number;
  showMonthNav?: boolean;
  showDimensionSwitcher?: boolean;
  hideInnerRing?: boolean;
  navigateOnSlice?: boolean;
  innerMeta?: Record<string, { personName: string | null }>;
  incomeDimension?: BreakdownDimension;
  onIncomeDimensionChange?: (dimension: BreakdownDimension) => void;
};

export type DrillNavigateAction =
  | { type: "dimension"; dimension: BreakdownDimension }
  | { type: "slice"; item: CategoryBreakdownItem }
  | { type: "breadcrumb"; segment: BreadcrumbSegment }
  | { type: "month"; direction: -1 | 1 };

export type MonthlyBarsMode = "expenses" | "income-vs-expense" | "by-category";

export type YearOverYearRow = {
  month: number;
  monthLabel: string;
  currentPeriod: string;
  priorPeriod: string | null;
  currentExpenses: number;
  currentExpensesYtd: number;
  priorExpenses: number | null;
  currentIncome: number;
  priorIncome: number | null;
  currentNet: number;
  priorNet: number | null;
  yoyExpensePct: number | null;
};

export type MonthlyBarsPanelProps = {
  monthlySeries: MonthlySeriesPoint[];
  trendPoints?: TrendPoint[];
  periodLabel: string;
  selectedPeriod?: string;
  onMonthSelect?: (period: string) => void;
};

export type DrillDownDonutProps = {
  items: CategoryBreakdownItem[];
  filter: AnalysisFilter;
  dimension: RingDimension;
  periodLabel: string;
  level: DrillLevel;
  breadcrumbs: BreadcrumbSegment[];
  level3Transactions?: DashboardRecentTransaction[];
  onNavigate: (action: DrillNavigateAction) => void;
  /** When false, slice clicks emit onNavigate({ type: "slice" }) instead of routing. Default true. */
  navigateOnSlice?: boolean;
  persistToUrl?: boolean;
  flow?: DonutFlow;
  balance?: RingBalance;
  balancedCaption?: string | null;
  showMonthNav?: boolean;
  showDimensionSwitcher?: boolean;
  /** When true, the last breadcrumb segment stays clickable (entity ring one level past last step). */
  breadcrumbLastClickable?: boolean;
  title?: string;
  /** Entity detail: cap chart width on narrow viewports; legend beside chart from lg. */
  narrowLayout?: boolean;
};

export const SWITCHABLE_DIMENSIONS: BreakdownDimension[] = [
  "category",
  "person",
  "card",
  "account",
  "merchant",
  "tag",
];

export const INCOME_DIMENSIONS: BreakdownDimension[] = [
  "salary",
  "merchant",
  "account",
  "person",
  "category",
];

export const DIMENSION_LABELS: Record<RingDimension, string> = {
  category: "לפי קטגוריה",
  subcategory: "לפי תת-קטגוריה",
  person: "לפי אדם",
  card: "לפי כרטיס",
  account: "לפי חשבון",
  merchant: "לפי בית עסק",
  tag: "לפי תגית",
  month: "לפי חודש",
  salary: "לפי משכורת",
  transaction: "לפי עסקה",
};

export const MONTHLY_MODE_LABELS: Record<MonthlyBarsMode, string> = {
  expenses: "הוצאות",
  "income-vs-expense": "הכנסות מול הוצאות",
  "by-category": "לפי קטגוריה",
};

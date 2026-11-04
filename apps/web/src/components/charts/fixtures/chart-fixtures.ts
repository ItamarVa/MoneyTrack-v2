/**
 * Fixture data for Wave 1 chart development before Track D breakdown API is wired.
 * UUIDs are stable so drill paths and URL state can be exercised in isolation.
 */
import type {
  AnalysisFilter,
  BreakdownDimension,
  CategoryBreakdownItem,
  DashboardRecentTransaction,
  MonthlySeriesPoint,
  TrendPoint,
} from "@moneytrack/contracts";

export const FIXTURE_PERIOD = "2026-08";
export const FIXTURE_PERIOD_LABEL = "אוגוסט 2026";

export const FIXTURE_CATEGORY_IDS = {
  food: "11111111-1111-4111-8111-111111111101",
  transport: "11111111-1111-4111-8111-111111111102",
  housing: "11111111-1111-4111-8111-111111111103",
  utilities: "11111111-1111-4111-8111-111111111104",
  health: "11111111-1111-4111-8111-111111111105",
  leisure: "11111111-1111-4111-8111-111111111106",
  clothing: "11111111-1111-4111-8111-111111111107",
  education: "11111111-1111-4111-8111-111111111108",
  supermarket: "22222222-2222-4222-8222-222222222201",
  restaurants: "22222222-2222-4222-8222-222222222202",
  delivery: "22222222-2222-4222-8222-222222222203",
} as const;

const baseFilter = (): AnalysisFilter => ({
  dateBasis: "transaction",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
});

function item(
  categoryId: string | null,
  categoryName: string,
  amountIls: number,
  transactionCount: number,
  filter: AnalysisFilter = baseFilter(),
): CategoryBreakdownItem {
  return {
    categoryId,
    categoryName,
    amountIls,
    transactionCount,
    drillDown: {
      filter,
      sourceView: "fixture-breakdown",
      sourceSegment: { categoryId, categoryName },
    },
  };
}

export const FIXTURE_CATEGORY_BREAKDOWN: CategoryBreakdownItem[] = [
  item(FIXTURE_CATEGORY_IDS.food, "מזון וסופר", -4820, 38),
  item(FIXTURE_CATEGORY_IDS.transport, "תחבורה ורכב", -2140, 16),
  item(FIXTURE_CATEGORY_IDS.housing, "דיור ומשק בית", -1890, 9),
  item(FIXTURE_CATEGORY_IDS.utilities, "חשבונות ותשתיות", -1260, 7),
  item(FIXTURE_CATEGORY_IDS.health, "בריאות", -980, 5),
  item(FIXTURE_CATEGORY_IDS.leisure, "פנאי ובידור", -760, 11),
  item(FIXTURE_CATEGORY_IDS.clothing, "ביגוד וטיפוח", -540, 4),
  item(FIXTURE_CATEGORY_IDS.education, "חינוך וילדים", -420, 3),
];

export const FIXTURE_PERSON_BREAKDOWN: CategoryBreakdownItem[] = [
  item("33333333-3333-4333-8333-333333333301", "הורה א", -6120, 42),
  item("33333333-3333-4333-8333-333333333302", "הורה ב", -3980, 28),
  item("33333333-3333-4333-8333-333333333303", "כללי", -1710, 23),
];

export const FIXTURE_CARD_BREAKDOWN: CategoryBreakdownItem[] = [
  item("44444444-4444-4444-8444-444444444401", "Visa · 4821", -5200, 31),
  item("44444444-4444-4444-8444-444444444402", "Mastercard · 9033", -3410, 19),
  item("44444444-4444-4444-8444-444444444403", "Amex · 1102", -2200, 8),
];

export const FIXTURE_ACCOUNT_BREAKDOWN: CategoryBreakdownItem[] = [
  item("55555555-5555-4555-8555-555555555501", "חשבון עו״ש", -2840, 14),
  item("55555555-5555-4555-8555-555555555502", "כרטיס Isracard", -5200, 31),
  item("55555555-5555-4555-8555-555555555503", "Bit", -1770, 13),
];

export const FIXTURE_MERCHANT_BREAKDOWN: CategoryBreakdownItem[] = [
  item("66666666-6666-4666-8666-666666666601", "שופרסל", -2140, 18),
  item("66666666-6666-4666-8666-666666666602", "פז", -980, 9),
  item("66666666-6666-4666-8666-666666666603", "Wolt", -760, 12),
  item("66666666-6666-4666-8666-666666666604", "סופר-פארם", -540, 4),
];

export const FIXTURE_TAG_BREAKDOWN: CategoryBreakdownItem[] = [
  item("77777777-7777-4777-8777-777777777701", "קבוע", -4980, 22),
  item("77777777-7777-4777-8777-777777777702", "ילדים", -1320, 9),
  item("77777777-7777-4777-8777-777777777703", "חופש", -890, 6),
];

export const FIXTURE_BREAKDOWN_BY_DIMENSION: Record<
  BreakdownDimension,
  CategoryBreakdownItem[]
> = {
  category: FIXTURE_CATEGORY_BREAKDOWN,
  subcategory: [],
  person: FIXTURE_PERSON_BREAKDOWN,
  card: FIXTURE_CARD_BREAKDOWN,
  account: FIXTURE_ACCOUNT_BREAKDOWN,
  merchant: FIXTURE_MERCHANT_BREAKDOWN,
  tag: FIXTURE_TAG_BREAKDOWN,
  month: [],
  salary: [],
};

export function fixtureSubcategoryBreakdown(parentId: string): CategoryBreakdownItem[] {
  if (parentId !== FIXTURE_CATEGORY_IDS.food) return [];

  const filter: AnalysisFilter = {
    ...baseFilter(),
    categoryIds: [parentId],
  };

  return [
    item(FIXTURE_CATEGORY_IDS.supermarket, "סופרמרקט", -3120, 24, filter),
    item(FIXTURE_CATEGORY_IDS.restaurants, "מסעדות", -1120, 9, filter),
    item(FIXTURE_CATEGORY_IDS.delivery, "משלוחים", -580, 5, filter),
  ];
}

export const FIXTURE_LEVEL3_TRANSACTIONS: DashboardRecentTransaction[] = [
  {
    id: "88888888-8888-4888-8888-888888888801",
    transactionDate: "2026-08-28",
    descriptionNormalized: "SHUFERSAL ONLINE",
    amountIls: -420,
    categoryId: FIXTURE_CATEGORY_IDS.supermarket,
    categoryName: "סופרמרקט",
  },
  {
    id: "88888888-8888-4888-8888-888888888802",
    transactionDate: "2026-08-21",
    descriptionNormalized: "RAMI LEVY",
    amountIls: -680,
    categoryId: FIXTURE_CATEGORY_IDS.supermarket,
    categoryName: "סופרמרקט",
  },
  {
    id: "88888888-8888-4888-8888-888888888803",
    transactionDate: "2026-08-14",
    descriptionNormalized: "YOHANANOF",
    amountIls: -540,
    categoryId: FIXTURE_CATEGORY_IDS.supermarket,
    categoryName: "סופרמרקט",
  },
  {
    id: "88888888-8888-4888-8888-888888888804",
    transactionDate: "2026-08-06",
    descriptionNormalized: "SHUFERSAL DEAL",
    amountIls: -390,
    categoryId: FIXTURE_CATEGORY_IDS.supermarket,
    categoryName: "סופרמרקט",
  },
];

function monthPoint(
  year: number,
  month: number,
  expenses: number,
  income: number,
): MonthlySeriesPoint {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  return {
    period,
    expensesIls: -expenses,
    incomeIls: income,
    netIls: income - expenses,
  };
}

/** 24 months ending August 2026 — enough for YoY toggle in fixtures. */
export const FIXTURE_MONTHLY_SERIES: MonthlySeriesPoint[] = [
  monthPoint(2025, 9, 9800, 18200),
  monthPoint(2025, 10, 10200, 18400),
  monthPoint(2025, 11, 9600, 18100),
  monthPoint(2025, 12, 11800, 19200),
  monthPoint(2026, 1, 9400, 18600),
  monthPoint(2026, 2, 9100, 18500),
  monthPoint(2026, 3, 9800, 18700),
  monthPoint(2026, 4, 10100, 18800),
  monthPoint(2026, 5, 10400, 18900),
  monthPoint(2026, 6, 9900, 18750),
  monthPoint(2026, 7, 10600, 19000),
  monthPoint(2026, 8, 11810, 19100),
  monthPoint(2025, 1, 8900, 18000),
  monthPoint(2025, 2, 8700, 17900),
  monthPoint(2025, 3, 9200, 18100),
  monthPoint(2025, 4, 9500, 18200),
  monthPoint(2025, 5, 9800, 18300),
  monthPoint(2025, 6, 9300, 18250),
  monthPoint(2025, 7, 9700, 18400),
  monthPoint(2025, 8, 10900, 18500),
];

export const FIXTURE_TREND_POINTS: TrendPoint[] = FIXTURE_MONTHLY_SERIES.filter((point) =>
  point.period.startsWith("2026-"),
).map((point) => ({
  period: point.period,
  drillDown: {
    filter: {
      dateBasis: "transaction",
      dateFrom: `${point.period}-01`,
      dateTo: `${point.period}-28`,
    },
    sourceView: "fixture-trend",
  },
  segments: [
    {
      categoryId: FIXTURE_CATEGORY_IDS.food,
      categoryName: "מזון וסופר",
      amountIls: -Math.round(Math.abs(point.expensesIls) * 0.38),
      drillDown: {
        filter: baseFilter(),
        sourceView: "fixture-trend",
      },
    },
    {
      categoryId: FIXTURE_CATEGORY_IDS.transport,
      categoryName: "תחבורה ורכב",
      amountIls: -Math.round(Math.abs(point.expensesIls) * 0.18),
      drillDown: {
        filter: baseFilter(),
        sourceView: "fixture-trend",
      },
    },
    {
      categoryId: FIXTURE_CATEGORY_IDS.housing,
      categoryName: "דיור ומשק בית",
      amountIls: -Math.round(Math.abs(point.expensesIls) * 0.16),
      drillDown: {
        filter: baseFilter(),
        sourceView: "fixture-trend",
      },
    },
    {
      categoryId: FIXTURE_CATEGORY_IDS.utilities,
      categoryName: "חשבונות ותשתיות",
      amountIls: -Math.round(Math.abs(point.expensesIls) * 0.28),
      drillDown: {
        filter: baseFilter(),
        sourceView: "fixture-trend",
      },
    },
  ],
}));

export function fixtureBreakdownFor(
  dimension: BreakdownDimension,
  filter: AnalysisFilter,
): CategoryBreakdownItem[] {
  if (filter.categoryIds?.length === 1) {
    return fixtureSubcategoryBreakdown(filter.categoryIds[0]!);
  }
  return FIXTURE_BREAKDOWN_BY_DIMENSION[dimension] ?? FIXTURE_CATEGORY_BREAKDOWN;
}

import {
  accounts,
  and,
  categories,
  categorizationDecisions,
  cards,
  eq,
  gte,
  lte,
  merchants,
  people,
  rollupMonthly,
  tags,
  transactionTags,
  transactions,
  type MoneyTrackDb,
} from "@moneytrack/db";
import type { AnalysisFilter, BreakdownDimension, DateBasis, DrillDownPredicate } from "@moneytrack/contracts";
import { selectAnalysisTransactions, effectiveIncomePeriod, loadSalaryReportingSettings } from "./analysis-filter.js";
import { expenseContribution, incomeContribution } from "./amounts.js";
import { nowIso, periodFromDate } from "./dates.js";
import { GENERAL_PERSON_LABEL, resolveCategoryBucketId, UNCATEGORIZED_LABEL, UNKNOWN_LABEL } from "./labels.js";
import { loadSalarySources, matchSalarySourceId, SALARY_OTHER_LABEL } from "./salary.js";

type RollupKey = {
  period: string;
  dateBasis: DateBasis;
  categoryId: string | null;
  cardId: string | null;
  personId: string | null;
};

export type BreakdownRow = {
  categoryId: string | null;
  categoryName: string;
  amountIls: number;
  transactionCount: number;
};

export type MonthlySeriesRow = {
  period: string;
  expensesIls: number;
  incomeIls: number;
  netIls: number;
};

export type BreakdownFlow = "expense" | "income";

function rollupKeyString(key: RollupKey): string {
  return `${key.period}|${key.dateBasis}|${key.categoryId ?? ""}|${key.cardId ?? ""}|${key.personId ?? ""}`;
}

function latestCategoryId(
  db: MoneyTrackDb,
  transactionId: string,
): string | null {
  const decisions = db
    .select()
    .from(categorizationDecisions)
    .where(eq(categorizationDecisions.transactionId, transactionId))
    .all();
  return decisions.at(-1)?.categoryId ?? null;
}

function personIdForCard(db: MoneyTrackDb, cardId: string | null): string | null {
  if (!cardId) {
    return null;
  }
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  return card?.cardholderPersonId ?? null;
}

function dateForBasis(txn: typeof transactions.$inferSelect, dateBasis: DateBasis): string {
  return dateBasis === "charge" ? txn.chargeDate : txn.transactionDate;
}

function categoryIdForTxn(db: MoneyTrackDb, txn: typeof transactions.$inferSelect): string | null {
  return txn.categoryId ?? latestCategoryId(db, txn.id);
}

function categoryNameForId(
  categoryNames: Map<string, string>,
  categoryId: string | null,
): string {
  if (!categoryId) {
    return UNCATEGORIZED_LABEL;
  }
  return categoryNames.get(categoryId) ?? UNKNOWN_LABEL;
}

function parentCategoryId(
  categoryRows: Map<string, { parentId: string | null; name: string }>,
  categoryId: string | null,
): string | null {
  if (!categoryId) {
    return null;
  }
  const row = categoryRows.get(categoryId);
  return row?.parentId ?? categoryId;
}

function loadCategoryMap(db: MoneyTrackDb): Map<string, { parentId: string | null; name: string }> {
  return new Map(
    db
      .select()
      .from(categories)
      .all()
      .map((row) => [row.id, { parentId: row.parentId, name: row.name }] as const),
  );
}

function categoryNamesFromMap(categoryRows: Map<string, { parentId: string | null; name: string }>): Map<string, string> {
  return new Map([...categoryRows.entries()].map(([id, row]) => [id, row.name] as const));
}

function periodDrillDown(filter: AnalysisFilter, period: string): DrillDownPredicate {
  const [year, month] = period.split("-");
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return {
    filter: {
      ...filter,
      dateFrom: `${period}-01`,
      dateTo: `${period}-${String(lastDay).padStart(2, "0")}`,
    },
    sourceView: "analysis-trend",
    sourceSegment: { period },
  };
}

function periodDateBounds(period: string): { dateFrom: string; dateTo: string } {
  const [year, month] = period.split("-");
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return {
    dateFrom: `${period}-01`,
    dateTo: `${period}-${String(lastDay).padStart(2, "0")}`,
  };
}

function transactionsForPeriod(
  db: MoneyTrackDb,
  period: string,
  dateBasis: DateBasis,
): (typeof transactions.$inferSelect)[] {
  const { dateFrom, dateTo } = periodDateBounds(period);
  const dateColumn = dateBasis === "charge" ? transactions.chargeDate : transactions.transactionDate;
  return db
    .select()
    .from(transactions)
    .where(and(gte(dateColumn, dateFrom), lte(dateColumn, dateTo)))
    .all();
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function markDirtyPeriodsForTransaction(
  txn: typeof transactions.$inferSelect,
  dirtyPeriods: Set<string>,
): void {
  dirtyPeriods.add(periodFromDate(txn.transactionDate));
  dirtyPeriods.add(periodFromDate(txn.chargeDate));
}

/** Rebuild rollup_monthly rows for every period touched by the given transactions. */
export function recomputeRollupsForTransactions(
  db: MoneyTrackDb,
  transactionIds: readonly string[],
): number {
  const dirty = new Set<string>();
  for (const id of transactionIds) {
    const txn = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (txn) {
      markDirtyPeriodsForTransaction(txn, dirty);
    }
  }
  return recomputeRollups(db, dirty);
}

/** Rebuild every period that has at least one transaction (after bulk classification). */
export function recomputeRollupsForAllTransactions(db: MoneyTrackDb): number {
  const dirty = new Set<string>();
  for (const txn of db.select().from(transactions).all()) {
    markDirtyPeriodsForTransaction(txn, dirty);
  }
  return recomputeRollups(db, dirty);
}

export function recomputeRollups(db: MoneyTrackDb, dirtyPeriods: Set<string>): number {
  if (dirtyPeriods.size === 0) {
    return 0;
  }

  const cardPersonIds = new Map(
    db.select().from(cards).all().map((row) => [row.id, row.cardholderPersonId] as const),
  );
  const dateBases: DateBasis[] = ["transaction", "charge"];
  let written = 0;

  for (const period of dirtyPeriods) {
    for (const dateBasis of dateBases) {
      db.delete(rollupMonthly)
        .where(and(eq(rollupMonthly.period, period), eq(rollupMonthly.dateBasis, dateBasis)))
        .run();

      const aggregates = new Map<string, { total: number; count: number; key: RollupKey }>();
      for (const txn of transactionsForPeriod(db, period, dateBasis)) {
        const signed = expenseContribution(txn) - incomeContribution(txn);
        if (signed === 0) {
          continue;
        }
        // rollup_monthly.totalAmountIls convention: positive = net expense, negative = net income.

        const key: RollupKey = {
          period,
          dateBasis,
          categoryId: categoryIdForTxn(db, txn),
          cardId: txn.cardId,
          personId: txn.cardId ? (cardPersonIds.get(txn.cardId) ?? null) : null,
        };
        const id = rollupKeyString(key);
        const bucket = aggregates.get(id) ?? { total: 0, count: 0, key };
        bucket.total += signed;
        bucket.count += 1;
        aggregates.set(id, bucket);
      }

      const computedAt = nowIso();
      for (const bucket of aggregates.values()) {
        db.insert(rollupMonthly)
          .values({
            period: bucket.key.period,
            dateBasis: bucket.key.dateBasis,
            categoryId: bucket.key.categoryId,
            cardId: bucket.key.cardId,
            personId: bucket.key.personId,
            totalAmountIls: bucket.total,
            transactionCount: bucket.count,
            computedAt,
          })
          .run();
        written += 1;
      }
    }
  }

  return written;
}

export function queryRollupTotals(
  db: MoneyTrackDb,
  filter: Pick<AnalysisFilter, "dateFrom" | "dateTo" | "dateBasis">,
): { period: string; totalAmountIls: number; transactionCount: number }[] {
  const dateBasis = filter.dateBasis ?? "transaction";
  const rows = db
    .select()
    .from(rollupMonthly)
    .all()
    .filter((row) => row.dateBasis === dateBasis);

  const grouped = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (filter.dateFrom && row.period < filter.dateFrom.slice(0, 7)) {
      continue;
    }
    if (filter.dateTo && row.period > filter.dateTo.slice(0, 7)) {
      continue;
    }
    const bucket = grouped.get(row.period) ?? { total: 0, count: 0 };
    bucket.total += row.totalAmountIls;
    bucket.count += row.transactionCount;
    grouped.set(row.period, bucket);
  }

  return [...grouped.entries()]
    .map(([period, bucket]) => ({
      period,
      totalAmountIls: bucket.total,
      transactionCount: bucket.count,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function queryDashboardKpis(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
): {
  totalExpensesIls: number;
  totalIncomeIls: number;
  netCashFlowIls: number;
  transactionCount: number;
} {
  const rows = selectAnalysisTransactions(db, filter);

  let totalExpensesIls = 0;
  let totalIncomeIls = 0;
  let transactionCount = 0;

  for (const txn of rows) {
    const expense = expenseContribution(txn);
    const income = incomeContribution(txn);
    if (expense === 0 && income === 0) {
      continue;
    }
    totalExpensesIls += expense;
    totalIncomeIls += income;
    transactionCount += 1;
  }

  return {
    totalExpensesIls,
    totalIncomeIls,
    netCashFlowIls: totalIncomeIls - totalExpensesIls,
    transactionCount,
  };
}

function aggregateContribution(
  grouped: Map<string | null, { amountIls: number; transactionCount: number }>,
  key: string | null,
  amount: number,
): void {
  const bucket = grouped.get(key) ?? { amountIls: 0, transactionCount: 0 };
  bucket.amountIls += amount;
  bucket.transactionCount += 1;
  grouped.set(key, bucket);
}

function personIdForTransaction(
  db: MoneyTrackDb,
  txn: typeof transactions.$inferSelect,
  accountOwners: Map<string, string | null>,
): string | null {
  const cardPerson = personIdForCard(db, txn.cardId);
  if (cardPerson) {
    return cardPerson;
  }
  if (!txn.accountId) {
    return null;
  }
  return accountOwners.get(txn.accountId) ?? null;
}

function breakdownFromTransactions(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
  dimension: BreakdownDimension,
  flow: BreakdownFlow = "expense",
): BreakdownRow[] {
  const categoryRows = loadCategoryMap(db);
  const categoryNames = categoryNamesFromMap(categoryRows);
  const accountList = db.select().from(accounts).all();
  const accountRows = new Map(accountList.map((row) => [row.id, row.displayName] as const));
  const accountOwners = new Map(accountList.map((row) => [row.id, row.ownerPersonId] as const));
  const cardRows = new Map(db.select().from(cards).all().map((row) => [row.id, row.displayName] as const));
  const personRows = new Map(db.select().from(people).all().map((row) => [row.id, row.displayName] as const));
  const merchantRows = new Map(db.select().from(merchants).all().map((row) => [row.id, row.canonicalName] as const));
  const tagRows = new Map(db.select().from(tags).all().map((row) => [row.id, row.name] as const));
  const salarySourceList = dimension === "salary" ? loadSalarySources(db, filter.personIds) : [];
  const salarySourceRows = new Map(
    salarySourceList.map((row) => [row.id, row.displayName] as const),
  );
  const salarySettings = loadSalaryReportingSettings(db);
  const tagsByTransaction = new Map<string, string[]>();
  for (const row of db.select().from(transactionTags).all()) {
    const list = tagsByTransaction.get(row.transactionId) ?? [];
    list.push(row.tagId);
    tagsByTransaction.set(row.transactionId, list);
  }

  const grouped = new Map<string | null, { amountIls: number; transactionCount: number }>();
  const parentFilter = filter.categoryIds?.[0] ?? null;

  for (const txn of selectAnalysisTransactions(db, filter)) {
    const contribution =
      flow === "income" ? incomeContribution(txn) : expenseContribution(txn);
    if (contribution === 0) {
      continue;
    }

    switch (dimension) {
      case "category": {
        const categoryId = categoryIdForTxn(db, txn);
        const parentId = parentCategoryId(categoryRows, resolveCategoryBucketId(categoryId));
        aggregateContribution(grouped, parentId, contribution);
        break;
      }
      case "subcategory": {
        const categoryId = categoryIdForTxn(db, txn);
        if (parentFilter && categoryId) {
          const row = categoryRows.get(categoryId);
          if (row?.parentId !== parentFilter) {
            continue;
          }
        } else if (parentFilter && !categoryId) {
          continue;
        }
        aggregateContribution(grouped, resolveCategoryBucketId(categoryId), contribution);
        break;
      }
      case "person": {
        const personId = personIdForTransaction(db, txn, accountOwners);
        aggregateContribution(grouped, personId, contribution);
        break;
      }
      case "card":
        aggregateContribution(grouped, txn.cardId, contribution);
        break;
      case "account":
        aggregateContribution(grouped, txn.accountId, contribution);
        break;
      case "merchant":
        aggregateContribution(grouped, txn.merchantId, contribution);
        break;
      case "tag": {
        const tagIds = tagsByTransaction.get(txn.id) ?? [];
        if (tagIds.length === 0) {
          aggregateContribution(grouped, null, contribution);
        } else {
          for (const tagId of tagIds) {
            aggregateContribution(grouped, tagId, contribution);
          }
        }
        break;
      }
      case "month": {
        const period =
          flow === "income"
            ? effectiveIncomePeriod(txn, salarySettings)
            : periodFromDate(dateForBasis(txn, filter.dateBasis ?? "transaction"));
        aggregateContribution(grouped, period, contribution);
        break;
      }
      case "salary": {
        if (flow !== "income") {
          break;
        }
        const salaryKey = matchSalarySourceId(txn, salarySourceList);
        aggregateContribution(grouped, salaryKey, contribution);
        break;
      }
      default:
        break;
    }
  }

  return [...grouped.entries()]
    .map(([key, bucket]) => ({
      categoryId: dimension === "month" ? null : key,
      categoryName: resolveBreakdownName(
        dimension,
        key,
        categoryNames,
        personRows,
        cardRows,
        accountRows,
        merchantRows,
        tagRows,
        salarySourceRows,
      ),
      amountIls: bucket.amountIls,
      transactionCount: bucket.transactionCount,
    }))
    .sort((a, b) => b.amountIls - a.amountIls);
}

function resolveBreakdownName(
  dimension: BreakdownDimension,
  key: string | null,
  categoryNames: Map<string, string>,
  personRows: Map<string, string>,
  cardRows: Map<string, string>,
  accountRows: Map<string, string>,
  merchantRows: Map<string, string>,
  tagRows: Map<string, string>,
  salarySourceRows: Map<string, string>,
): string {
  if (dimension === "month") {
    return key ?? UNKNOWN_LABEL;
  }
  if (!key) {
    if (dimension === "salary") {
      return SALARY_OTHER_LABEL;
    }
    if (dimension === "person") {
      return GENERAL_PERSON_LABEL;
    }
    if (dimension === "category" || dimension === "subcategory") {
      return UNCATEGORIZED_LABEL;
    }
    return UNKNOWN_LABEL;
  }

  switch (dimension) {
    case "category":
    case "subcategory":
      return categoryNameForId(categoryNames, key);
    case "person":
      return personRows.get(key) ?? UNKNOWN_LABEL;
    case "card":
      return cardRows.get(key) ?? UNKNOWN_LABEL;
    case "account":
      return accountRows.get(key) ?? UNKNOWN_LABEL;
    case "merchant":
      return merchantRows.get(key) ?? UNKNOWN_LABEL;
    case "tag":
      return tagRows.get(key) ?? UNKNOWN_LABEL;
    case "salary":
      return salarySourceRows.get(key) ?? UNKNOWN_LABEL;
    default:
      return UNKNOWN_LABEL;
  }
}

export function queryBreakdown(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
  dimension: BreakdownDimension = "category",
  flow: BreakdownFlow = "expense",
): BreakdownRow[] {
  // ponytail: rollup_monthly stores net expense minus income per bucket — expense breakdown
  // must use expenseContribution only so every dimension totals match queryDashboardKpis.
  return breakdownFromTransactions(db, filter, dimension, flow);
}

/** @deprecated Use queryBreakdown(db, filter, "category") */
export function queryCategoryBreakdown(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
): BreakdownRow[] {
  return queryBreakdown(db, filter, "category");
}

export function queryMonthlySeries(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
): MonthlySeriesRow[] {
  const dateBasis = filter.dateBasis ?? "transaction";
  const salarySettings = loadSalaryReportingSettings(db);
  const grouped = new Map<string, { expensesIls: number; incomeIls: number }>();

  for (const txn of selectAnalysisTransactions(db, filter)) {
    const expense = expenseContribution(txn);
    if (expense > 0) {
      const expensePeriod = periodFromDate(dateForBasis(txn, dateBasis));
      const bucket = grouped.get(expensePeriod) ?? { expensesIls: 0, incomeIls: 0 };
      bucket.expensesIls += expense;
      grouped.set(expensePeriod, bucket);
    }

    const income = incomeContribution(txn);
    if (income > 0) {
      const incomePeriod = effectiveIncomePeriod(txn, salarySettings);
      const bucket = grouped.get(incomePeriod) ?? { expensesIls: 0, incomeIls: 0 };
      bucket.incomeIls += income;
      grouped.set(incomePeriod, bucket);
    }
  }

  return [...grouped.entries()]
    .map(([period, bucket]) => ({
      period,
      expensesIls: bucket.expensesIls,
      incomeIls: bucket.incomeIls,
      netIls: bucket.incomeIls - bucket.expensesIls,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function queryCategoryTrend(
  db: MoneyTrackDb,
  filter: AnalysisFilter,
): {
  period: string;
  segments: {
    categoryId: string | null;
    categoryName: string;
    amountIls: number;
  }[];
}[] {
  const categoryNames = categoryNamesFromMap(loadCategoryMap(db));
  const byPeriod = new Map<string, Map<string | null, { amountIls: number; transactionCount: number }>>();

  for (const txn of selectAnalysisTransactions(db, filter)) {
    const expense = expenseContribution(txn);
    if (expense === 0) continue;
    const period = periodFromDate(dateForBasis(txn, filter.dateBasis ?? "transaction"));
    const categoryId = categoryIdForTxn(db, txn);
    const periodBucket = byPeriod.get(period) ?? new Map();
    const segment = periodBucket.get(categoryId) ?? { amountIls: 0, transactionCount: 0 };
    segment.amountIls += expense;
    segment.transactionCount += 1;
    periodBucket.set(categoryId, segment);
    byPeriod.set(period, periodBucket);
  }

  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, segments]) => ({
      period,
      segments: [...segments.entries()]
        .map(([categoryId, bucket]) => ({
          categoryId,
          categoryName: categoryNameForId(categoryNames, categoryId),
          amountIls: bucket.amountIls,
        }))
        .sort((a, b) => b.amountIls - a.amountIls),
    }));
}

export { periodDrillDown, pctChange };

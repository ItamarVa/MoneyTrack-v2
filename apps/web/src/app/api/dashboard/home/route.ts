import {
  alerts,
  and,
  budgets,
  categories,
  desc,
  eq,
  gte,
  lte,
  netWorthSnapshots,
  transactions,
} from "@moneytrack/db";
import {
  computeNetWorthCompleteness,
  pctChange,
  persistNetWorthSnapshot,
  queryBreakdown,
  queryDashboardKpis,
  queryMonthlySeries,
} from "@moneytrack/engine";
import { DEFAULT_DATE_BASIS, DashboardHomeResponseSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { budgetWithVariance } from "@/server/budgets";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { UNCATEGORIZED_LABEL } from "@moneytrack/engine";
import type { DashboardHomeExtras } from "@/components/dashboard/dashboard-home-types";
import {
  buildUsualMonth,
  previousPeriods,
  type UsualMonth,
} from "@/components/dashboard/usual-month";

export const runtime = "nodejs";

/**
 * A month is always judged whole, never capped at today.
 */
function monthBounds(reference: Date): { dateFrom: string; dateTo: string; label: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return {
    dateFrom: `${prefix}-01`,
    dateTo: `${prefix}-${String(lastDay).padStart(2, "0")}`,
    label: reference.toLocaleDateString("he-IL", { month: "long", year: "numeric" }),
  };
}

function previousMonth(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
}

function resolveAnchorDate(periodParam: string | null): Date {
  if (periodParam && periodParam !== "all" && /^\d{4}-\d{2}$/.test(periodParam)) {
    const [year, month] = periodParam.split("-").map(Number);
    return new Date(year ?? 0, (month ?? 1) - 1, 1);
  }
  return new Date();
}

function periodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Median of the previous months' expenses. For the month in progress each earlier month is
 * cut at the same day, so "so far" is judged against "so far" instead of a whole month.
 */
function usualMonthFor(
  db: Parameters<typeof queryDashboardKpis>[0],
  monthlySeries: Array<{ period: string; expensesIls: number }>,
  anchorPeriod: string,
  throughDay: number | null,
): UsualMonth | null {
  const fullMonth = new Map(monthlySeries.map((row) => [row.period, row.expensesIls] as const));
  const amounts: number[] = [];
  for (const period of previousPeriods(anchorPeriod)) {
    const full = fullMonth.get(period) ?? 0;
    // A month with no expenses is a month before the data started, not a frugal one.
    if (full <= 0) continue;
    if (throughDay == null) {
      amounts.push(full);
      continue;
    }
    const [year, month] = period.split("-").map(Number);
    const lastDay = new Date(year!, month!, 0).getDate();
    amounts.push(
      queryDashboardKpis(db, {
        dateBasis: DEFAULT_DATE_BASIS,
        dateFrom: `${period}-01`,
        dateTo: `${period}-${String(Math.min(throughDay, lastDay)).padStart(2, "0")}`,
      }).totalExpensesIls,
    );
  }
  return buildUsualMonth(amounts, throughDay);
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const periodParam = new URL(request.url).searchParams.get("period");
  const isAll = periodParam === "all";
  const anchorDate = resolveAnchorDate(periodParam);

  const current = isAll ? null : monthBounds(anchorDate);
  const previous = monthBounds(previousMonth(anchorDate));

  // Charge basis (owner 2026-11-04, revised): the dashboard answers "what was charged this month".
  const currentFilter = isAll
    ? { dateBasis: DEFAULT_DATE_BASIS }
    : {
        dateBasis: DEFAULT_DATE_BASIS,
        dateFrom: current!.dateFrom,
        dateTo: current!.dateTo,
      };
  const previousFilter = {
    dateBasis: DEFAULT_DATE_BASIS,
    dateFrom: previous.dateFrom,
    dateTo: previous.dateTo,
  };

  const kpis = queryDashboardKpis(ctx.db, currentFilter);
  const previousKpis = isAll ? null : queryDashboardKpis(ctx.db, previousFilter);
  const openAlerts = ctx.db
    .select()
    .from(alerts)
    .all()
    .filter((row) => row.status === "open").length;

  // Same refresh the net-worth route does, so a snapshot written before a rule change never shows.
  const snapshotDay = new Date().toISOString().slice(0, 10);
  persistNetWorthSnapshot(ctx.db, snapshotDay);
  const netWorthCompleteness = computeNetWorthCompleteness(ctx.db, snapshotDay);

  const snapshots = ctx.db.select().from(netWorthSnapshots).all();
  const latest = [...snapshots].sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  const previousSnapshot = [...snapshots].sort((a, b) => b.asOf.localeCompare(a.asOf))[1];

  const seriesStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 23, 1);
  const seriesFilter = isAll
    ? { dateBasis: DEFAULT_DATE_BASIS }
    : {
        dateBasis: DEFAULT_DATE_BASIS,
        dateFrom: `${seriesStart.getFullYear()}-${String(seriesStart.getMonth() + 1).padStart(2, "0")}-01`,
        dateTo: current!.dateTo,
      };
  const monthlySeries = queryMonthlySeries(ctx.db, seriesFilter);

  const categoryNames = new Map(
    ctx.db
      .select()
      .from(categories)
      .all()
      .map((row) => [row.id, row.name] as const),
  );
  // Purchases only: transfers, card bills, loan payments, income and excluded rows are not
  // something the person "bought". Bounded by the selected period, newest first.
  const recentRows = ctx.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.kind, "expense"),
        eq(transactions.direction, "debit"),
        eq(transactions.excludedFromTotals, false),
        ...(current
          ? [
              gte(transactions.chargeDate, current.dateFrom),
              lte(transactions.chargeDate, current.dateTo),
            ]
          : []),
      ),
    )
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .limit(8)
    .all();

  const anchorPeriod = periodKey(anchorDate);
  const today = new Date();
  const inProgress = !isAll && periodKey(today) === anchorPeriod;
  const usualMonth = isAll
    ? null
    : usualMonthFor(ctx.db, monthlySeries, anchorPeriod, inProgress ? today.getDate() : null);
  const topCategories = queryBreakdown(ctx.db, currentFilter, "category", "expense")
    .filter((row) => row.amountIls > 0)
    .sort((a, b) => b.amountIls - a.amountIls)
    .slice(0, 3)
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: localizeBreakdownLabel(row.categoryName),
      amountIls: row.amountIls,
    }));
  const monthIsEmpty = kpis.totalExpensesIls === 0 && kpis.totalIncomeIls === 0;
  const latestPeriodWithData =
    !isAll && monthIsEmpty
      ? ([...queryMonthlySeries(ctx.db, { dateBasis: DEFAULT_DATE_BASIS })]
          .filter((row) => row.period !== anchorPeriod && (row.expensesIls !== 0 || row.incomeIls !== 0))
          .map((row) => row.period)
          .sort()
          .at(-1) ?? null)
      : null;
  const extras: DashboardHomeExtras = {
    usualMonth,
    topCategories,
    latestPeriodWithData,
    netWorthPartial: netWorthCompleteness.partial,
    netWorthPartialReasons: netWorthCompleteness.reasons,
  };

  const budgetPeriod = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, "0")}`;
  const topBudgets = ctx.db
    .select()
    .from(budgets)
    .all()
    .filter((row) => row.period === budgetPeriod)
    .map((row) => budgetWithVariance(ctx.db, row))
    .sort((a, b) => b.variancePct - a.variancePct)
    .slice(0, 3)
    .map((budget) => ({
      id: budget.id,
      categoryName: budget.categoryName,
      amount: budget.amount,
      actualIls: budget.actualIls,
      variancePct: budget.variancePct,
    }));

  const savingsRate =
    kpis.totalIncomeIls > 0 ? (kpis.netCashFlowIls / kpis.totalIncomeIls) * 100 : null;

  const body = DashboardHomeResponseSchema.parse({
    openAlerts,
    netWorthIls: latest?.netWorthIls ?? null,
    totalExpensesIls: kpis.totalExpensesIls,
    totalIncomeIls: kpis.totalIncomeIls,
    netCashFlowIls: kpis.netCashFlowIls,
    savingsRate,
    periodLabel: isAll ? "כל התקופה" : current!.label,
    previousPeriod: {
      totalExpensesIls: previousKpis?.totalExpensesIls ?? 0,
      totalIncomeIls: previousKpis?.totalIncomeIls ?? 0,
      netCashFlowIls: previousKpis?.netCashFlowIls ?? 0,
      netWorthIls: previousSnapshot?.netWorthIls ?? null,
      expensesChangePct: isAll
        ? null
        : pctChange(kpis.totalExpensesIls, previousKpis!.totalExpensesIls),
      incomeChangePct: isAll
        ? null
        : pctChange(kpis.totalIncomeIls, previousKpis!.totalIncomeIls),
      netChangePct: isAll
        ? null
        : pctChange(kpis.netCashFlowIls, previousKpis!.netCashFlowIls),
      netWorthChangePct: isAll
        ? null
        : latest && previousSnapshot
          ? pctChange(latest.netWorthIls, previousSnapshot.netWorthIls)
          : null,
    },
    monthlySeries,
    recentTransactions: recentRows.map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      descriptionNormalized: row.descriptionNormalized,
      amountIls: row.amountIls,
      categoryId: row.categoryId,
      categoryName: row.categoryId
        ? (categoryNames.get(row.categoryId) ?? null)
        : localizeBreakdownLabel(UNCATEGORIZED_LABEL),
    })),
    topBudgets,
  });

  // Contracts does not know the extras yet; spread them after parsing so zod does not strip them.
  return NextResponse.json({ ...body, ...extras });
}

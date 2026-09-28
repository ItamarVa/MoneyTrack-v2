import { alerts, budgets, categories, netWorthSnapshots, transactions } from "@moneytrack/db";
import { pctChange, queryDashboardKpis, queryMonthlySeries } from "@moneytrack/engine";
import { DashboardHomeResponseSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { budgetWithVariance } from "@/server/budgets";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { UNCATEGORIZED_LABEL } from "@moneytrack/engine";

export const runtime = "nodejs";

/**
 * A month is always judged whole: a charge dated later this month is already
 * committed money, so capping at today would understate what the month costs.
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

export async function GET(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const periodParam = new URL(request.url).searchParams.get("period");
  const isAll = periodParam === "all";
  const anchorDate = resolveAnchorDate(periodParam);

  const current = isAll ? null : monthBounds(anchorDate);
  const previous = monthBounds(previousMonth(anchorDate));

  // Charge basis: the dashboard answers "what leaves the account this month".
  const currentFilter = isAll
    ? { dateBasis: "charge" as const }
    : {
        dateBasis: "charge" as const,
        dateFrom: current!.dateFrom,
        dateTo: current!.dateTo,
      };
  const previousFilter = {
    dateBasis: "charge" as const,
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

  const snapshots = ctx.db.select().from(netWorthSnapshots).all();
  const latest = [...snapshots].sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  const previousSnapshot = [...snapshots].sort((a, b) => b.asOf.localeCompare(a.asOf))[1];

  const seriesStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 23, 1);
  const seriesFilter = isAll
    ? { dateBasis: "charge" as const }
    : {
        dateBasis: "charge" as const,
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
  const recentRows = ctx.db
    .select()
    .from(transactions)
    .all()
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
    .slice(0, 8);

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

  return NextResponse.json(body);
}

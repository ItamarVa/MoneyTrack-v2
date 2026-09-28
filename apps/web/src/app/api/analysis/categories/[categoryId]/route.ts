import { buildCategoryInsights } from "@moneytrack/alerts";
import {
  CategoryDetailQuerySchema,
  CategoryDetailResponseSchema,
} from "@moneytrack/contracts";
import { categories, eq } from "@moneytrack/db";
import { pctChange, queryDashboardKpis } from "@moneytrack/engine";
import { monthBoundsFor } from "@/lib/analysis-filter";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { guardApi } from "@/server/guard-api";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ categoryId: string }> };

function periodAnchor(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, 1);
}

function priorPeriod(period: string): string {
  const anchor = periodAnchor(period);
  const prior = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  return `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, "0")}`;
}

function categoryPeriodFilter(period: string, categoryId: string) {
  const bounds = monthBoundsFor(periodAnchor(period));
  return {
    dateBasis: "charge" as const,
    dateFrom: bounds.dateFrom,
    dateTo: bounds.dateTo,
    categoryIds: [categoryId],
  };
}

function categoryPeriodTotals(
  db: Parameters<typeof queryDashboardKpis>[0],
  period: string,
  categoryId: string,
): { totalIls: number; transactionCount: number } {
  const kpis = queryDashboardKpis(db, categoryPeriodFilter(period, categoryId));
  return {
    totalIls: kpis.totalExpensesIls,
    transactionCount: kpis.transactionCount,
  };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { categoryId } = await context.params;
  const category = ctx.db.select().from(categories).where(eq(categories.id, categoryId)).get();
  if (!category) return notFound("Category");

  try {
    const { period } = CategoryDetailQuerySchema.parse({
      period: new URL(request.url).searchParams.get("period"),
    });

    const current = categoryPeriodTotals(ctx.db, period, categoryId);
    const previous = categoryPeriodTotals(ctx.db, priorPeriod(period), categoryId);
    const insights = buildCategoryInsights(ctx.db, categoryId, period);

    const body = CategoryDetailResponseSchema.parse({
      categoryId,
      categoryName: category.name,
      period,
      totalIls: current.totalIls,
      transactionCount: current.transactionCount,
      previousTotalIls: previous.totalIls,
      pctChange: pctChange(current.totalIls, previous.totalIls) ?? 0,
      insights,
    });

    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

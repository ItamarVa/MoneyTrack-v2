import {
  AnalysisFilterSchema,
  TrendResponseSchema,
  type TrendPoint,
} from "@moneytrack/contracts";
import { periodDrillDown, queryCategoryTrend } from "@moneytrack/engine";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { drillDownCategoryIds } from "@/lib/category-ids";
import { guardApi } from "@/server/guard-api";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const filter = AnalysisFilterSchema.parse(await request.json());
    const rows = queryCategoryTrend(ctx.db, filter);
    const points: TrendPoint[] = rows.map((row) => ({
      period: row.period,
      drillDown: periodDrillDown(filter, row.period),
      segments: row.segments.map((segment) => ({
        categoryId: segment.categoryId,
        categoryName: localizeBreakdownLabel(segment.categoryName),
        amountIls: segment.amountIls,
        drillDown: {
          filter: {
            ...filter,
            ...periodDrillDown(filter, row.period).filter,
            categoryIds: drillDownCategoryIds(segment.categoryId),
          },
          sourceView: "analysis-trend",
          sourceSegment: { period: row.period, categoryId: segment.categoryId },
        },
      })),
    }));

    const body = TrendResponseSchema.parse({ filter, points });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

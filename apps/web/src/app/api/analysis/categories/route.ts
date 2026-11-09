import {
  AnalysisFilterSchema,
  CategoryBreakdownResponseSchema,
  type CategoryBreakdownItem,
} from "@moneytrack/contracts";
import { queryCategoryBreakdown } from "@moneytrack/engine";
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
    const rows = queryCategoryBreakdown(ctx.db, filter);
    const items: CategoryBreakdownItem[] = rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: localizeBreakdownLabel(row.categoryName),
      amountIls: row.amountIls,
      transactionCount: row.transactionCount,
      drillDown: {
        filter: {
          ...filter,
          categoryIds: drillDownCategoryIds(row.categoryId),
        },
        sourceView: "analysis-categories",
        sourceSegment: { categoryId: row.categoryId },
      },
    }));

    const body = CategoryBreakdownResponseSchema.parse({ filter, items });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

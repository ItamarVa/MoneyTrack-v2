import {
  BreakdownRequestSchema,
  BreakdownResponseSchema,
  type BreakdownDimension,
  type BreakdownRequest,
  type CategoryBreakdownItem,
  type DrillDownPredicate,
} from "@moneytrack/contracts";
import { periodDrillDown, queryBreakdown, type BreakdownRow } from "@moneytrack/engine";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { drillDownCategoryIds } from "@/lib/category-ids";
import { guardApi } from "@/server/guard-api";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function breakdownDrillDown(
  request: BreakdownRequest,
  dimension: BreakdownDimension,
  row: BreakdownRow,
): DrillDownPredicate {
  const { dimension: _dimension, ...filter } = request;
  const key = row.categoryId;

  switch (dimension) {
    case "category":
      return {
        filter: { ...filter, categoryIds: drillDownCategoryIds(key) },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, categoryId: key },
      };
    case "subcategory":
      return {
        filter: { ...filter, categoryIds: drillDownCategoryIds(key) },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, subcategoryId: key },
      };
    case "person":
      return {
        filter: { ...filter, personIds: key ? [key] : undefined },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, personId: key },
      };
    case "card":
      return {
        filter: { ...filter, cardIds: key ? [key] : undefined },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, cardId: key },
      };
    case "account":
      return {
        filter: { ...filter, accountIds: key ? [key] : undefined },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, accountId: key },
      };
    case "merchant":
      return {
        filter: { ...filter, merchantIds: key ? [key] : undefined },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, merchantId: key },
      };
    case "tag":
      return {
        filter: { ...filter, tagIds: key ? [key] : undefined },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, tagId: key },
      };
    case "month": {
      const periodDrill = periodDrillDown(filter, row.categoryName);
      return {
        filter: periodDrill.filter,
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, period: row.categoryName },
      };
    }
    case "salary":
      return {
        filter: { ...filter, salaryScope: key ?? "other" },
        sourceView: "analysis-breakdown",
        sourceSegment: { dimension, salarySourceId: key },
      };
  }
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = BreakdownRequestSchema.parse(raw);
    const flow = raw.flow === "income" ? "income" : "expense";
    const { dimension, ...filter } = body;
    const rows = queryBreakdown(ctx.db, filter, dimension, flow);
    const items: CategoryBreakdownItem[] = rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: localizeBreakdownLabel(row.categoryName),
      amountIls: row.amountIls,
      transactionCount: row.transactionCount,
      drillDown: breakdownDrillDown(body, dimension, row),
    }));

    const response = BreakdownResponseSchema.parse({ filter, items });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

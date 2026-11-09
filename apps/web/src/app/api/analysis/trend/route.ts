import {
  AnalysisFilterSchema,
  TrendResponseSchema,
  type TrendPoint,
} from "@moneytrack/contracts";
import { periodDrillDown, queryCategoryTrend, type TrendDimension } from "@moneytrack/engine";
import { accounts, cards } from "@moneytrack/db";
import { accountLabel } from "@/lib/account-label";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { drillDownCategoryIds } from "@/lib/category-ids";
import { guardApi } from "@/server/guard-api";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

type AccountRow = { institutionCode: string; numberLast4: string | null };

function segmentFilter(dimension: TrendDimension, id: string | null, accountsById: Map<string, AccountRow>) {
  // Null person/card has no id filter to express, so it drills into the unfiltered period.
  if (dimension === "person") return { personIds: id ? [id] : undefined };
  // Card-less credit connections key the segment by account id, filtered like the credit page chips.
  if (dimension === "card") {
    if (!id) return { cardIds: undefined };
    return accountsById.has(id) ? { accountIds: [id] } : { cardIds: [id] };
  }
  return { categoryIds: drillDownCategoryIds(id) };
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const raw = new URL(request.url).searchParams.get("dimension") ?? "category";
  if (raw !== "category" && raw !== "person" && raw !== "card") {
    return apiError(400, "Invalid dimension", "invalid_dimension");
  }
  const dimension: TrendDimension = raw;

  try {
    const filter = AnalysisFilterSchema.parse(await request.json());
    const rows = queryCategoryTrend(ctx.db, filter, dimension);
    const accountsById = new Map<string, AccountRow>(
      dimension === "card" ? ctx.db.select().from(accounts).all().map((row) => [row.id, row] as const) : [],
    );
    const cardsPerAccount = new Map<string, string[]>();
    if (dimension === "card") {
      for (const card of ctx.db.select().from(cards).all()) {
        cardsPerAccount.set(card.settlementAccountId, [...(cardsPerAccount.get(card.settlementAccountId) ?? []), card.displayName]);
      }
    }
    const segmentName = (id: string | null, name: string): string => {
      const account = id ? accountsById.get(id) : undefined;
      const linked = id ? cardsPerAccount.get(id) : undefined;
      // A lone linked card's Settings name (already in `name` from the engine) wins over the account label.
      if (linked?.length === 1 && linked[0]) return linked[0];
      return account
        ? accountLabel({ institutionCode: account.institutionCode, last4: account.numberLast4 })
        : localizeBreakdownLabel(name);
    };
    const points: TrendPoint[] = rows.map((row) => ({
      period: row.period,
      drillDown: periodDrillDown(filter, row.period),
      segments: row.segments.map((segment) => ({
        categoryId: segment.categoryId,
        categoryName: segmentName(segment.categoryId, segment.categoryName),
        amountIls: segment.amountIls,
        drillDown: {
          filter: {
            ...filter,
            ...periodDrillDown(filter, row.period).filter,
            ...segmentFilter(dimension, segment.categoryId, accountsById),
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

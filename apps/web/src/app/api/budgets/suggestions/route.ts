import { DEFAULT_DATE_BASIS } from "@moneytrack/contracts";
import { categories, rollupMonthly } from "@moneytrack/db";
import { lastFullMonths, suggestBudgets } from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";

export const runtime = "nodejs";

/** Average of the last 3 full months per top-level category; see engine budget-suggestions.ts. */
export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const months = lastFullMonths(new Date());
  const rows = ctx.db
    .select()
    .from(rollupMonthly)
    .all()
    .filter((row) => row.dateBasis === DEFAULT_DATE_BASIS)
    .map((row) => ({
      period: row.period,
      categoryId: row.categoryId,
      amountIls: row.totalAmountIls,
    }));

  const suggestions = suggestBudgets({
    rows,
    categories: ctx.db
      .select()
      .from(categories)
      .all()
      .map((row) => ({ id: row.id, parentId: row.parentId, name: row.name })),
    months,
  });

  return NextResponse.json({ months, suggestions });
}

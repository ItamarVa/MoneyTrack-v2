import { randomUUID } from "node:crypto";
import { budgets, eq } from "@moneytrack/db";
import { BudgetCreateRequestSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { budgetWithVariance } from "@/server/budgets";
import { zodErrorResponse } from "@/server/api-response";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db.select().from(budgets).all().sort((a, b) => b.period.localeCompare(a.period));
  return NextResponse.json({ budgets: rows.map((row) => budgetWithVariance(ctx.db, row)) });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const body = BudgetCreateRequestSchema.parse(await request.json());
    const id = randomUUID();
    ctx.db
      .insert(budgets)
      .values({
        id,
        categoryId: body.categoryId,
        period: body.period,
        amount: body.amount,
        createdAt: nowIso(),
      })
      .run();

    const row = ctx.db.select().from(budgets).where(eq(budgets.id, id)).get();
    return NextResponse.json(budgetWithVariance(ctx.db, row!), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

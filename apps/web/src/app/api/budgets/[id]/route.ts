import { budgets, eq } from "@moneytrack/db";
import { BudgetPatchRequestSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { budgetWithVariance } from "@/server/budgets";
import { zodErrorResponse } from "@/server/api-response";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const { id } = await params;
    const body = BudgetPatchRequestSchema.parse(await request.json());
    const row = ctx.db.select().from(budgets).where(eq(budgets.id, id)).get();
    if (!row) {
      return NextResponse.json({ error: "Budget not found", code: "not_found" }, { status: 404 });
    }

    ctx.db
      .update(budgets)
      .set({
        amount: body.amount ?? row.amount,
        period: body.period ?? row.period,
      })
      .where(eq(budgets.id, id))
      .run();

    const updated = ctx.db.select().from(budgets).where(eq(budgets.id, id)).get();
    return NextResponse.json(budgetWithVariance(ctx.db, updated!));
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await params;
  const row = ctx.db.select().from(budgets).where(eq(budgets.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "Budget not found", code: "not_found" }, { status: 404 });
  }

  ctx.db.delete(budgets).where(eq(budgets.id, id)).run();
  return NextResponse.json({ ok: true });
}

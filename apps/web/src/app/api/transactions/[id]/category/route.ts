/**
 * PATCH sets a manual category on one row; DELETE hands the row back to the automatic pipeline
 * (drops the manual lock, re-classifies). Both answer with the updated row.
 * Gotcha: the seeded uncategorized bucket is never a valid manual pick: it would lock the row with no way back to rules.
 */
import { TransactionCategoryPatchRequestSchema } from "@moneytrack/contracts";
import { categorizationDecisions, eq, transactions } from "@moneytrack/db";
import { UNCATEGORIZED_CATEGORY_ID, clearManualDecision, manualClassify } from "@moneytrack/classify";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapTransaction } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { refreshRollupsForTransactions } from "@/server/rollup-refresh";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type GuardContext = Exclude<Awaited<ReturnType<typeof guardApi>>, Response>;

function updatedRowResponse(ctx: GuardContext, id: string, fallbackCategoryId: string | null) {
  const row = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get()!;
  const decision = ctx.db
    .select()
    .from(categorizationDecisions)
    .where(eq(categorizationDecisions.transactionId, id))
    .all()
    .at(-1);

  return NextResponse.json({
    transaction: mapTransaction(row),
    categoryId: decision?.categoryId ?? fallbackCategoryId,
    tags: [],
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) return notFound("Transaction");

  try {
    const body = TransactionCategoryPatchRequestSchema.parse(await request.json());
    if (body.categoryId === UNCATEGORIZED_CATEGORY_ID) {
      return apiError(
        400,
        "Uncategorized cannot be chosen manually; use DELETE to return to automatic",
        "uncategorized_not_pickable",
      );
    }
    manualClassify(ctx.db, id, body.categoryId);

    writeAudit(ctx.db, "categorization_override", ctx.session.user.id, {
      transactionId: id,
      categoryId: body.categoryId,
    });

    refreshRollupsForTransactions(ctx.db, [id]);

    return updatedRowResponse(ctx, id, body.categoryId);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) return notFound("Transaction");

  const outcome = clearManualDecision(ctx.db, id);

  writeAudit(ctx.db, "categorization_reset", ctx.session.user.id, { transactionId: id });

  refreshRollupsForTransactions(ctx.db, [id]);

  return updatedRowResponse(ctx, id, outcome?.categoryId ?? null);
}

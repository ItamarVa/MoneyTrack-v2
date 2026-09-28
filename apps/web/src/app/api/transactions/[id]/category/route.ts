import { TransactionCategoryPatchRequestSchema } from "@moneytrack/contracts";
import { categorizationDecisions, eq, transactions } from "@moneytrack/db";
import { manualClassify } from "@moneytrack/classify";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapTransaction } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { refreshRollupsForTransactions } from "@/server/rollup-refresh";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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
    manualClassify(ctx.db, id, body.categoryId);

    writeAudit(ctx.db, "categorization_override", ctx.session.user.id, {
      transactionId: id,
      categoryId: body.categoryId,
    });

    refreshRollupsForTransactions(ctx.db, [id]);

    const row = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get()!;
    const decision = ctx.db
      .select()
      .from(categorizationDecisions)
      .where(eq(categorizationDecisions.transactionId, id))
      .all()
      .at(-1);

    return NextResponse.json({
      transaction: mapTransaction(row),
      categoryId: decision?.categoryId ?? body.categoryId,
      tags: [],
    });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

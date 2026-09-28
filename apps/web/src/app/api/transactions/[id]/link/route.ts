import { TransactionLinkRequestSchema } from "@moneytrack/contracts";
import { eq, transactions } from "@moneytrack/db";
import { manualLinkTransactions } from "@moneytrack/engine";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id: fromId } = await context.params;
  const fromTxn = ctx.db.select().from(transactions).where(eq(transactions.id, fromId)).get();
  if (!fromTxn) {
    return notFound("Transaction");
  }

  try {
    const body = TransactionLinkRequestSchema.parse(await request.json());
    const toTxn = ctx.db.select().from(transactions).where(eq(transactions.id, body.toId)).get();
    if (!toTxn) {
      return notFound("Transaction");
    }

    const linkId = manualLinkTransactions(ctx.db, fromId, body.toId, body.linkType);
    if (!linkId) {
      return apiError(409, "Link already exists", "duplicate_link");
    }

    writeAudit(ctx.db, "transaction_link_manual", ctx.session.user.id, {
      fromId,
      toId: body.toId,
      linkType: body.linkType,
    });

    return NextResponse.json({
      linkId,
      fromId,
      toId: body.toId,
      linkType: body.linkType,
      source: "manual",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

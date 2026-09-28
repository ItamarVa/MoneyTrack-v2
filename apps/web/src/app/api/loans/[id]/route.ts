import { LoanUpdateRequestSchema } from "@moneytrack/contracts";
import {
  accounts,
  earlyRepaymentScenarios,
  eq,
  loanScheduleRows,
  loanTracks,
  loans,
} from "@moneytrack/db";
import { recomputeLoanSchedules } from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { afterLoanMutation, buildLoanDetail } from "@/server/loans";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const detail = buildLoanDetail(ctx.db, id);
  if (!detail) {
    return notFound("Loan");
  }

  return NextResponse.json(detail);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const existing = ctx.db.select().from(loans).where(eq(loans.id, id)).get();
  if (!existing) {
    return notFound("Loan");
  }

  try {
    const body = LoanUpdateRequestSchema.parse(await request.json());
    const updates: Partial<typeof loans.$inferInsert> = {};
    if (body.lender !== undefined) updates.lender = body.lender;
    if (body.kind !== undefined) updates.kind = body.kind;
    if (body.originationDate !== undefined) updates.originationDate = body.originationDate;
    if (body.originalPrincipal !== undefined) updates.originalPrincipal = body.originalPrincipal;

    if (Object.keys(updates).length > 0) {
      ctx.db.update(loans).set(updates).where(eq(loans.id, id)).run();
      recomputeLoanSchedules(ctx.db, id);
      writeAudit(ctx.db, "loan_update", ctx.session.user.id, { loanId: id });
      afterLoanMutation(ctx.db);
    }

    const detail = buildLoanDetail(ctx.db, id)!;
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
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
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const existing = ctx.db.select().from(loans).where(eq(loans.id, id)).get();
  if (!existing) {
    return notFound("Loan");
  }

  const tracks = ctx.db.select().from(loanTracks).where(eq(loanTracks.loanId, id)).all();
  for (const track of tracks) {
    ctx.db.delete(loanScheduleRows).where(eq(loanScheduleRows.trackId, track.id)).run();
  }
  ctx.db.delete(loanTracks).where(eq(loanTracks.loanId, id)).run();
  ctx.db.delete(earlyRepaymentScenarios).where(eq(earlyRepaymentScenarios.loanId, id)).run();
  ctx.db.delete(loans).where(eq(loans.id, id)).run();
  ctx.db.delete(accounts).where(eq(accounts.id, existing.accountId)).run();

  writeAudit(ctx.db, "loan_delete", ctx.session.user.id, { loanId: id });
  afterLoanMutation(ctx.db);

  return NextResponse.json({ ok: true });
}

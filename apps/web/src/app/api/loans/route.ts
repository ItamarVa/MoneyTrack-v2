import { LoanCreateRequestSchema } from "@moneytrack/contracts";
import { accounts, eq, loanTracks, loans } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { zodErrorResponse } from "@/server/api-response";
import { afterLoanMutation, buildLoanDetail, loanRemainingPrincipal } from "@/server/loans";
import { mapLoan, mapLoanTrack } from "@/server/mappers";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const loanRows = ctx.db.select().from(loans).all();
  const items = loanRows.map((loan) => {
    const tracks = ctx.db
      .select()
      .from(loanTracks)
      .where(eq(loanTracks.loanId, loan.id))
      .all()
      .map(mapLoanTrack);
    return {
      ...mapLoan(loan),
      tracks,
      remainingPrincipal: loanRemainingPrincipal(ctx.db, loan.id),
    };
  });

  return NextResponse.json({ loans: items });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  try {
    const body = LoanCreateRequestSchema.parse(await request.json());
    const now = nowIso();
    const accountId = randomUUID();
    const loanId = randomUUID();

    ctx.db.insert(accounts).values({
      id: accountId,
      kind: "loan",
      connectionId: null,
      institutionCode: "manual",
      displayName: body.displayName,
      numberLast4: null,
      currency: "ILS",
      ownerPersonId: body.ownerPersonId ?? ctx.session.user.personId,
      createdAt: now,
      updatedAt: now,
    }).run();

    ctx.db.insert(loans).values({
      id: loanId,
      accountId,
      kind: body.kind,
      lender: body.lender,
      originationDate: body.originationDate,
      originalPrincipal: body.originalPrincipal,
      createdAt: now,
    }).run();

    writeAudit(ctx.db, "loan_create", ctx.session.user.id, { loanId, accountId });
    afterLoanMutation(ctx.db);

    const detail = buildLoanDetail(ctx.db, loanId)!;
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

import { LoanTrackCreateRequestSchema } from "@moneytrack/contracts";
import { eq, loanTracks, loans } from "@moneytrack/db";
import { recomputeTrackSchedule } from "@moneytrack/engine";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { afterLoanMutation } from "@/server/loans";
import { mapLoanTrack } from "@/server/mappers";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

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

  const { id: loanId } = await context.params;
  const loan = ctx.db.select().from(loans).where(eq(loans.id, loanId)).get();
  if (!loan) {
    return notFound("Loan");
  }

  try {
    const body = LoanTrackCreateRequestSchema.parse(await request.json());
    const trackId = randomUUID();
    const now = nowIso();

    ctx.db.insert(loanTracks).values({
      id: trackId,
      loanId,
      rateType: body.rateType,
      margin: body.margin ?? null,
      fixedRate: body.fixedRate ?? null,
      termMonths: body.termMonths,
      principal: body.principal,
      amortizationMethod: body.amortizationMethod,
      cpiBaseIndexValue: body.cpiBaseIndexValue ?? null,
      cpiConvention: body.cpiConvention,
      rateResetMonths: body.rateResetMonths ?? null,
      createdAt: now,
    }).run();

    recomputeTrackSchedule(ctx.db, trackId);
    writeAudit(ctx.db, "loan_track_create", ctx.session.user.id, { loanId, trackId });
    afterLoanMutation(ctx.db);

    const track = ctx.db.select().from(loanTracks).where(eq(loanTracks.id, trackId)).get()!;
    return NextResponse.json({ track: mapLoanTrack(track) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

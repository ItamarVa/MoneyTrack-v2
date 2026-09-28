import { eq, loanTracks, loans } from "@moneytrack/db";
import { getScheduleForTrack, recomputeTrackSchedule } from "@moneytrack/engine";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { notFound } from "@/server/api-response";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; trackId: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id: loanId, trackId } = await context.params;
  const loan = ctx.db.select().from(loans).where(eq(loans.id, loanId)).get();
  if (!loan) {
    return notFound("Loan");
  }

  const track = ctx.db.select().from(loanTracks).where(eq(loanTracks.id, trackId)).get();
  if (!track || track.loanId !== loanId) {
    return notFound("Track");
  }

  let schedule = getScheduleForTrack(ctx.db, trackId);
  if (!schedule) {
    schedule = recomputeTrackSchedule(ctx.db, trackId);
  }

  return NextResponse.json({
    trackId,
    assumptionSetId: schedule.assumptionSetId,
    rows: schedule.rows.map((row) => ({
      periodIndex: row.periodIndex,
      dueDate: row.dueDate,
      principalPart: row.principalPart,
      interestPart: row.interestPart,
      cpiAdjustment: row.cpiAdjustment,
      remainingPrincipal: row.remainingPrincipal,
      totalPayment: row.totalPayment,
    })),
    totalInterest: schedule.totalInterest,
    totalPrincipal: schedule.totalPrincipal,
  });
}

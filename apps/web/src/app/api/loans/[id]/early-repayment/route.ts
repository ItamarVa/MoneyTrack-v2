import { EarlyRepaymentScenarioCreateRequestSchema } from "@moneytrack/contracts";
import { earlyRepaymentScenarios, eq, loans } from "@moneytrack/db";
import {
  computeEarlyRepaymentForLoan,
  currentAssumptionSetId,
} from "@moneytrack/engine";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { mapEarlyRepaymentScenario } from "@/server/mappers";

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
    const body = EarlyRepaymentScenarioCreateRequestSchema.parse(await request.json());
    const assumptionSetId = currentAssumptionSetId(ctx.db);
    const comparison = computeEarlyRepaymentForLoan(ctx.db, loanId, body.extraPayment);

    const scenarioId = randomUUID();
    const savedAt = nowIso();
    ctx.db.insert(earlyRepaymentScenarios).values({
      id: scenarioId,
      loanId,
      name: body.name,
      extraPayment: body.extraPayment,
      assumptionSetId,
      savedAt,
    }).run();

    writeAudit(ctx.db, "early_repayment_scenario", ctx.session.user.id, {
      loanId,
      scenarioId,
      extraPayment: body.extraPayment,
    });

    const scenario = ctx.db
      .select()
      .from(earlyRepaymentScenarios)
      .where(eq(earlyRepaymentScenarios.id, scenarioId))
      .get()!;

    return NextResponse.json({
      scenario: mapEarlyRepaymentScenario(scenario),
      interestSaved: comparison.interestSaved,
      monthsSaved: comparison.monthsSaved,
      tracks: comparison.tracks,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

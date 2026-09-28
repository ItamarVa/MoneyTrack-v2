/**
 * POST reapply salary reporting periods to all unlocked salary-matched income rows.
 * Used from settings UI after rule changes; delegates to engine batch helper.
 */
import { SalaryReportingReapplyResponseSchema } from "@moneytrack/contracts";
import { applySalaryReportingPeriods } from "@moneytrack/engine";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

  const updated = applySalaryReportingPeriods(ctx.db);
  writeAudit(ctx.db, "salary_reporting_reapply", ctx.session.user.id, { updated });

  const response = SalaryReportingReapplyResponseSchema.parse({ updated });
  return NextResponse.json(response);
}

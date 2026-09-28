import {
  AnalysisFilterSchema,
  AnalysisSummaryResponseSchema,
} from "@moneytrack/contracts";
import { queryDashboardKpis } from "@moneytrack/engine";
import { guardApi } from "@/server/guard-api";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const filter = AnalysisFilterSchema.parse(await request.json());
    const kpis = queryDashboardKpis(ctx.db, filter);
    const body = AnalysisSummaryResponseSchema.parse({
      filter,
      ...kpis,
      drillDown: {
        filter,
        sourceView: "analysis-summary",
      },
    });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

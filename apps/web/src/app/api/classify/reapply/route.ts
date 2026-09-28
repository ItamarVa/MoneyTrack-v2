import { ClassifyReapplyResponseSchema } from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { enqueueAndKickReapplyClassifyRunner } from "@/server/classify-jobs";
import { mapJob } from "@/server/mappers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const jobRow = enqueueAndKickReapplyClassifyRunner(ctx.db);
  const response = ClassifyReapplyResponseSchema.parse({ job: mapJob(jobRow) });
  return NextResponse.json(response);
}

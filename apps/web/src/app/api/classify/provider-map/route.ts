import {
  ProviderCategoryMapListResponseSchema,
  ProviderCategoryMapUpdateRequestSchema,
  ProviderCategoryMapUpdateResponseSchema,
} from "@moneytrack/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { enqueueAndKickClassifyRunner } from "@/server/classify-jobs";
import { mapJob } from "@/server/mappers";
import {
  listProviderCategoryMappings,
  updateProviderCategoryMappings,
} from "@/server/provider-map-helpers";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const mappings = listProviderCategoryMappings(ctx.db);
  const response = ProviderCategoryMapListResponseSchema.parse({ mappings });
  return NextResponse.json(response);
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const body = ProviderCategoryMapUpdateRequestSchema.parse(await request.json());

    try {
      updateProviderCategoryMappings(ctx.db, body.mappings);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("category_not_found:")) {
        return apiError(400, "Target category not found", "category_not_found");
      }
      throw error;
    }

    const jobRow = enqueueAndKickClassifyRunner(ctx.db);
    const response = ProviderCategoryMapUpdateResponseSchema.parse({
      job: mapJob(jobRow),
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

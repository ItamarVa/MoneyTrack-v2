import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { countPatternMatches } from "@/server/rules-helpers";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const runtime = "nodejs";

const PreviewRequestSchema = z.object({
  pattern: z.string(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const body = PreviewRequestSchema.parse(await request.json());
    const matchCount = countPatternMatches(ctx.db, body.pattern);
    return NextResponse.json({ matchCount });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

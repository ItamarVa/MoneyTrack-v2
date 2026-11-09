/**
 * POST /api/people/[id]/merge { targetId }: fold a duplicate person into another one.
 * The work (re-pointing every person reference, deleting the source, rebuilding rollups)
 * lives in server/people-merge.ts and runs in one DB transaction. Irreversible by design;
 * the settings UI asks for explicit confirmation. Audit entry carries ids and counts only.
 */
import { z, ZodError } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { mergePerson } from "@/server/people-merge";
import he from "@/locales/he.json";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Person ids are UUIDs today, but older seeds may not be; accept any bounded id.
const MergeRequestSchema = z.object({ targetId: z.string().min(1).max(200) });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const errors = he.personMerge.errors;

  let targetId: string;
  try {
    targetId = MergeRequestSchema.parse(await request.json()).targetId;
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    if (error instanceof SyntaxError) return apiError(400, errors.invalidBody, "invalid_body");
    throw error;
  }

  const result = mergePerson(ctx.db, id, targetId);
  if (!result.ok) {
    if (result.reason === "same_person") return apiError(400, errors.samePerson, "invalid_merge");
    if (result.reason === "source_not_found") return apiError(404, errors.sourceNotFound, "person_not_found");
    return apiError(404, errors.targetNotFound, "person_not_found");
  }

  writeAudit(ctx.db, "person_merge", ctx.session.user.id, {
    personId: id,
    targetId,
    ...result.moved,
  });

  return NextResponse.json({ ok: true, moved: result.moved });
}

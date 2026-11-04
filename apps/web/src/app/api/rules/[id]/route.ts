import { RuleUpdateRequestSchema } from "@moneytrack/contracts";
import { categories, categorizationRules, eq } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapRule } from "@/server/rule-mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { enqueueAndKickClassifyRunner } from "@/server/classify-jobs";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(categorizationRules).where(eq(categorizationRules.id, id)).get();
  if (!existing) return notFound("Rule");

  try {
    const body = RuleUpdateRequestSchema.parse(await request.json());
    if (body.categoryId !== undefined) {
      const category = ctx.db
        .select()
        .from(categories)
        .where(eq(categories.id, body.categoryId))
        .get();
      if (!category) {
        return apiError(400, "Target category not found", "category_not_found");
      }
    }

    const updates: Partial<typeof categorizationRules.$inferInsert> = {};
    if (body.pattern !== undefined) updates.pattern = body.pattern;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    ctx.db.update(categorizationRules).set(updates).where(eq(categorizationRules.id, id)).run();
    writeAudit(ctx.db, "rule_update", ctx.session.user.id, { ruleId: id });
    enqueueAndKickClassifyRunner(ctx.db);

    const row = ctx.db.select().from(categorizationRules).where(eq(categorizationRules.id, id)).get()!;
    return NextResponse.json(mapRule(row));
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(categorizationRules).where(eq(categorizationRules.id, id)).get();
  if (!existing) return notFound("Rule");

  ctx.db.delete(categorizationRules).where(eq(categorizationRules.id, id)).run();
  writeAudit(ctx.db, "rule_delete", ctx.session.user.id, { ruleId: id });
  enqueueAndKickClassifyRunner(ctx.db);

  return NextResponse.json({ ok: true });
}

import { RuleCreateRequestSchema } from "@moneytrack/contracts";
import { categories, categorizationRules, desc, eq } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapRule } from "@/server/rule-mappers";
import { writeAudit } from "@/server/auth";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { enqueueAndKickClassifyRunner } from "@/server/classify-jobs";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db
    .select()
    .from(categorizationRules)
    .orderBy(desc(categorizationRules.priority))
    .all();

  return NextResponse.json({ rules: rows.map(mapRule) });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  try {
    const body = RuleCreateRequestSchema.parse(await request.json());
    const category = ctx.db
      .select()
      .from(categories)
      .where(eq(categories.id, body.categoryId))
      .get();
    if (!category) {
      return apiError(400, "Target category not found", "category_not_found");
    }

    const now = nowIso();
    const id = randomUUID();

    ctx.db
      .insert(categorizationRules)
      .values({
        id,
        pattern: body.pattern,
        categoryId: body.categoryId,
        priority: body.priority,
        enabled: body.enabled,
        createdAt: now,
      })
      .run();

    writeAudit(ctx.db, "rule_create", ctx.session.user.id, { ruleId: id });
    enqueueAndKickClassifyRunner(ctx.db);

    const row = ctx.db.select().from(categorizationRules).where(eq(categorizationRules.id, id)).get();
    return NextResponse.json(mapRule(row!), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

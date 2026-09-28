import { UNCATEGORIZED_CATEGORY_ID } from "@moneytrack/classify";
import { CategoryUpdateRequestSchema } from "@moneytrack/contracts";
import {
  budgets,
  categories,
  categorizationDecisions,
  categorizationRules,
  eq,
  merchantCategoryLearned,
  transactionSplits,
  transactions,
} from "@moneytrack/db";
import { z } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapCategory } from "@/server/category-mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { refreshAllRollups } from "@/server/rollup-refresh";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

const CategoryDeleteRequestSchema = z.object({
  reassignTo: z.string().uuid(),
});

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const row = ctx.db.select().from(categories).where(eq(categories.id, id)).get();
  if (!row) return notFound("Category");

  return NextResponse.json(mapCategory(row));
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const existing = ctx.db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) return notFound("Category");

  try {
    const body = CategoryUpdateRequestSchema.parse(await request.json());
    const updates: Partial<typeof categories.$inferInsert> = {};

    if (body.parentId !== undefined) updates.parentId = body.parentId;
    if (body.name !== undefined) updates.name = body.name;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    ctx.db.update(categories).set(updates).where(eq(categories.id, id)).run();
    writeAudit(ctx.db, "category_update", ctx.session.user.id, { categoryId: id });

    const row = ctx.db.select().from(categories).where(eq(categories.id, id)).get()!;
    return NextResponse.json(mapCategory(row));
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
  const existing = ctx.db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) return notFound("Category");

  if (id === UNCATEGORIZED_CATEGORY_ID) {
    return apiError(409, "The uncategorized bucket cannot be deleted", "protected_category");
  }

  const child = ctx.db.select().from(categories).where(eq(categories.parentId, id)).get();
  if (child) {
    return apiError(
      409,
      "Remove or reparent child categories before deleting this category",
      "category_has_children",
    );
  }

  let reassignTo: string;
  try {
    const body = CategoryDeleteRequestSchema.parse(await request.json());
    reassignTo = body.reassignTo;
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }

  if (reassignTo === id) {
    return apiError(400, "Reassign target must differ from the deleted category", "invalid_reassign");
  }

  const target = ctx.db.select().from(categories).where(eq(categories.id, reassignTo)).get();
  if (!target) {
    return apiError(400, "Reassign target category not found", "category_not_found");
  }

  ctx.db.update(transactions).set({ categoryId: reassignTo }).where(eq(transactions.categoryId, id)).run();
  ctx.db
    .update(categorizationRules)
    .set({ categoryId: reassignTo })
    .where(eq(categorizationRules.categoryId, id))
    .run();
  ctx.db
    .update(transactionSplits)
    .set({ categoryId: reassignTo })
    .where(eq(transactionSplits.categoryId, id))
    .run();
  ctx.db
    .update(merchantCategoryLearned)
    .set({ categoryId: reassignTo })
    .where(eq(merchantCategoryLearned.categoryId, id))
    .run();
  ctx.db.update(budgets).set({ categoryId: reassignTo }).where(eq(budgets.categoryId, id)).run();
  ctx.db
    .update(categorizationDecisions)
    .set({ categoryId: reassignTo })
    .where(eq(categorizationDecisions.categoryId, id))
    .run();
  ctx.db
    .update(categorizationDecisions)
    .set({ previousCategoryId: reassignTo })
    .where(eq(categorizationDecisions.previousCategoryId, id))
    .run();

  ctx.db.delete(categories).where(eq(categories.id, id)).run();
  refreshAllRollups(ctx.db);
  writeAudit(ctx.db, "category_delete", ctx.session.user.id, { categoryId: id, reassignTo });

  return NextResponse.json({ ok: true });
}

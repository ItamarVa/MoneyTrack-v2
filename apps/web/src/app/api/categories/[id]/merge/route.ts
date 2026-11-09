/**
 * Merge one category into another: every reference to the source moves to the target,
 * the source's children are re-parented to the target, then the source is deleted — all in
 * one DB transaction. GET returns how many transactions a merge would move (for the confirm step).
 * Seeded system categories (fixed UUID prefix) may be targets but never sources.
 */
import {
  budgets,
  categories,
  categorizationDecisions,
  categorizationRules,
  eq,
  merchantCategoryLearned,
  providerCategoryMap,
  sql,
  transactionSplits,
  transactions,
} from "@moneytrack/db";
import { z } from "zod";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { writeAudit } from "@/server/auth";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { refreshAllRollups } from "@/server/rollup-refresh";
import he from "@/locales/he.json";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

const MergeRequestSchema = z.object({ targetId: z.string().uuid() });

const SYSTEM_CATEGORY_PREFIX = "00000000-0000-4000-8000-";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const row = ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.categoryId, id))
    .get();
  return NextResponse.json({ transactionCount: row?.n ?? 0 });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const errors = he.categoryMerge.errors;

  let targetId: string;
  try {
    targetId = MergeRequestSchema.parse(await request.json()).targetId;
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }

  const source = ctx.db.select().from(categories).where(eq(categories.id, id)).get();
  if (!source) return apiError(404, errors.sourceNotFound, "category_not_found");

  if (targetId === id) return apiError(400, errors.sameCategory, "invalid_merge");

  if (id.startsWith(SYSTEM_CATEGORY_PREFIX)) {
    return apiError(409, errors.systemSource, "protected_category");
  }

  const all = ctx.db.select().from(categories).all();
  const byId = new Map(all.map((row) => [row.id, row]));
  if (!byId.has(targetId)) return apiError(400, errors.targetNotFound, "category_not_found");

  // Walk up from the target; reaching the source means the target is its descendant.
  const seen = new Set<string>();
  for (let cur = byId.get(targetId)?.parentId; cur && !seen.has(cur); cur = byId.get(cur)?.parentId) {
    if (cur === id) return apiError(400, errors.descendant, "invalid_merge");
    seen.add(cur);
  }

  const transactionCount =
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.categoryId, id))
      .get()?.n ?? 0;

  ctx.db.transaction((tx) => {
    tx.update(transactions).set({ categoryId: targetId }).where(eq(transactions.categoryId, id)).run();
    tx.update(transactionSplits)
      .set({ categoryId: targetId })
      .where(eq(transactionSplits.categoryId, id))
      .run();
    tx.update(categorizationRules)
      .set({ categoryId: targetId })
      .where(eq(categorizationRules.categoryId, id))
      .run();
    tx.update(merchantCategoryLearned)
      .set({ categoryId: targetId })
      .where(eq(merchantCategoryLearned.categoryId, id))
      .run();
    tx.update(budgets).set({ categoryId: targetId }).where(eq(budgets.categoryId, id)).run();
    tx.update(providerCategoryMap)
      .set({ categoryId: targetId })
      .where(eq(providerCategoryMap.categoryId, id))
      .run();
    tx.update(categorizationDecisions)
      .set({ categoryId: targetId })
      .where(eq(categorizationDecisions.categoryId, id))
      .run();
    tx.update(categorizationDecisions)
      .set({ previousCategoryId: targetId })
      .where(eq(categorizationDecisions.previousCategoryId, id))
      .run();
    tx.update(categories).set({ parentId: targetId }).where(eq(categories.parentId, id)).run();
    tx.delete(categories).where(eq(categories.id, id)).run();
  });

  refreshAllRollups(ctx.db);
  writeAudit(ctx.db, "category_merge", ctx.session.user.id, {
    categoryId: id,
    targetId,
    transactionCount,
  });

  return NextResponse.json({ ok: true, transactionCount });
}

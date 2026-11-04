import {
  CategoryCreateRequestSchema,
} from "@moneytrack/contracts";
import { categories, eq } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapCategory } from "@/server/category-mappers";
import { writeAudit } from "@/server/auth";
import { apiError, zodErrorResponse } from "@/server/api-response";
import he from "@/locales/he.json";
import { hasSiblingWithName } from "./category-name";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db.select().from(categories).all();
  return NextResponse.json({ categories: rows.map(mapCategory) });
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
    const body = CategoryCreateRequestSchema.parse(await request.json());
    const now = nowIso();
    const id = randomUUID();
    const name = body.name.trim();
    if (!name) return apiError(400, "Category name is required", "validation_error");

    if (hasSiblingWithName(ctx.db, body.parentId ?? null, name)) {
      return apiError(409, he.categoryMerge.duplicateName, "duplicate_category_name");
    }

    ctx.db.insert(categories).values({
      id,
      parentId: body.parentId ?? null,
      name,
      sortOrder: body.sortOrder,
      createdAt: now,
    }).run();

    writeAudit(ctx.db, "category_create", ctx.session.user.id, { categoryId: id });

    const row = ctx.db.select().from(categories).where(eq(categories.id, id)).get();
    return NextResponse.json(mapCategory(row!), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

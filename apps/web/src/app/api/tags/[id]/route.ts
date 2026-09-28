import { TagUpdateRequestSchema } from "@moneytrack/contracts";
import { eq, tags } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapTag } from "@/server/category-mappers";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
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
  const existing = ctx.db.select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) return notFound("Tag");

  try {
    const body = TagUpdateRequestSchema.parse(await request.json());
    const updates: Partial<typeof tags.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;

    ctx.db.update(tags).set(updates).where(eq(tags.id, id)).run();
    writeAudit(ctx.db, "tag_update", ctx.session.user.id, { tagId: id });

    const row = ctx.db.select().from(tags).where(eq(tags.id, id)).get()!;
    return NextResponse.json(mapTag(row));
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
  const existing = ctx.db.select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) return notFound("Tag");

  ctx.db.delete(tags).where(eq(tags.id, id)).run();
  writeAudit(ctx.db, "tag_delete", ctx.session.user.id, { tagId: id });

  return NextResponse.json({ ok: true });
}

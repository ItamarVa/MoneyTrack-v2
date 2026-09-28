import { TagCreateRequestSchema } from "@moneytrack/contracts";
import { eq, tags } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapTag } from "@/server/category-mappers";
import { writeAudit } from "@/server/auth";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db.select().from(tags).all();
  return NextResponse.json({ tags: rows.map(mapTag) });
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
    const body = TagCreateRequestSchema.parse(await request.json());
    const now = nowIso();
    const id = randomUUID();

    ctx.db.insert(tags).values({
      id,
      name: body.name,
      color: body.color ?? null,
      createdAt: now,
    }).run();

    writeAudit(ctx.db, "tag_create", ctx.session.user.id, { tagId: id });

    const row = ctx.db.select().from(tags).where(eq(tags.id, id)).get();
    return NextResponse.json(mapTag(row!), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

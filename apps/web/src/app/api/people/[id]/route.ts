import { PersonUpdateRequestSchema } from "@moneytrack/contracts";
import { cards, eq, people } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapPerson } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

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
  const existing = ctx.db.select().from(people).where(eq(people.id, id)).get();
  if (!existing) return notFound("Person");

  try {
    const body = PersonUpdateRequestSchema.parse(await request.json());
    const updates: Partial<typeof people.$inferInsert> = { updatedAt: nowIso() };
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.isChild !== undefined) updates.isChild = body.isChild;

    ctx.db.update(people).set(updates).where(eq(people.id, id)).run();
    writeAudit(ctx.db, "person_update", ctx.session.user.id, { personId: id });

    const row = ctx.db.select().from(people).where(eq(people.id, id)).get()!;
    return NextResponse.json(mapPerson(row));
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
  const existing = ctx.db.select().from(people).where(eq(people.id, id)).get();
  if (!existing) return notFound("Person");

  const linkedCards = ctx.db
    .select()
    .from(cards)
    .where(eq(cards.cardholderPersonId, id))
    .all();
  if (linkedCards.length > 0) {
    return apiError(
      409,
      "Cannot delete person with linked cards",
      "person_has_cards",
      { cardCount: linkedCards.length },
    );
  }

  ctx.db.delete(people).where(eq(people.id, id)).run();
  writeAudit(ctx.db, "person_delete", ctx.session.user.id, { personId: id });

  return NextResponse.json({ ok: true });
}

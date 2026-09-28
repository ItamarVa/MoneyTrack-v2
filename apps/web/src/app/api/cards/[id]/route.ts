import { CardUpdateRequestSchema } from "@moneytrack/contracts";
import { cards, eq, people } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapCard } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const { id } = await context.params;
  const row = ctx.db.select().from(cards).where(eq(cards.id, id)).get();
  if (!row) return notFound("Card");

  return NextResponse.json(mapCard(row));
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
  const existing = ctx.db.select().from(cards).where(eq(cards.id, id)).get();
  if (!existing) return notFound("Card");

  try {
    const body = CardUpdateRequestSchema.parse(await request.json());

    if (body.cardholderPersonId !== undefined) {
      const person = ctx.db
        .select()
        .from(people)
        .where(eq(people.id, body.cardholderPersonId))
        .get();
      if (!person) {
        return apiError(400, "Cardholder not found", "invalid_cardholder");
      }
    }

    const updates: Partial<typeof cards.$inferInsert> = { updatedAt: nowIso() };
    if (body.last4 !== undefined) updates.last4 = body.last4;
    if (body.cardholderPersonId !== undefined) updates.cardholderPersonId = body.cardholderPersonId;
    if (body.brand !== undefined) updates.brand = body.brand;
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.note !== undefined) updates.note = body.note;

    ctx.db.update(cards).set(updates).where(eq(cards.id, id)).run();
    writeAudit(ctx.db, "card_update", ctx.session.user.id, { cardId: id });

    const row = ctx.db.select().from(cards).where(eq(cards.id, id)).get()!;
    return NextResponse.json(mapCard(row));
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
  const existing = ctx.db.select().from(cards).where(eq(cards.id, id)).get();
  if (!existing) return notFound("Card");

  ctx.db.delete(cards).where(eq(cards.id, id)).run();
  writeAudit(ctx.db, "card_delete", ctx.session.user.id, { cardId: id });

  return NextResponse.json({ ok: true });
}

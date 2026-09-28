import {
  CardCreateRequestSchema,
  CardListResponseSchema,
} from "@moneytrack/contracts";
import { accounts, cards, eq, people } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapCard } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { apiError, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) return ctx;

  const rows = ctx.db.select().from(cards).all();
  const body = CardListResponseSchema.parse({ cards: rows.map(mapCard) });
  return NextResponse.json(body);
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
    const body = CardCreateRequestSchema.parse(await request.json());

    const account = ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, body.settlementAccountId))
      .get();
    if (!account) {
      return apiError(400, "Settlement account not found", "invalid_settlement_account");
    }

    const person = ctx.db
      .select()
      .from(people)
      .where(eq(people.id, body.cardholderPersonId))
      .get();
    if (!person) {
      return apiError(400, "Cardholder not found", "invalid_cardholder");
    }

    const now = nowIso();
    const id = randomUUID();

    ctx.db.insert(cards).values({
      id,
      settlementAccountId: body.settlementAccountId,
      last4: body.last4,
      cardholderPersonId: body.cardholderPersonId,
      brand: body.brand ?? null,
      displayName: body.displayName,
      note: body.note ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();

    writeAudit(ctx.db, "card_create", ctx.session.user.id, { cardId: id });

    const row = ctx.db.select().from(cards).where(eq(cards.id, id)).get()!;
    return NextResponse.json(mapCard(row), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

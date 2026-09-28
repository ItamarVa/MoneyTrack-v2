import { AccountUpdateRequestSchema } from "@moneytrack/contracts";
import { accounts, cards, eq } from "@moneytrack/db";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapAccount, mapCard } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { notFound, zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const account = ctx.db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) {
    return notFound("Account");
  }

  const cardRows = ctx.db.select().from(cards).where(eq(cards.settlementAccountId, id)).all();
  return NextResponse.json({
    account: mapAccount(account),
    cards: cardRows.map(mapCard),
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const { id } = await context.params;
  const existing = ctx.db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) {
    return notFound("Account");
  }

  try {
    const body = AccountUpdateRequestSchema.parse(await request.json());
    const now = nowIso();
    const updates: Partial<typeof accounts.$inferInsert> = { updatedAt: now };

    if (body.displayName !== undefined) {
      updates.displayName = body.displayName;
    }
    if (body.numberLast4 !== undefined) {
      updates.numberLast4 = body.numberLast4;
    }
    if (body.ownerPersonId !== undefined) {
      updates.ownerPersonId = body.ownerPersonId;
    }
    if (body.note !== undefined) {
      updates.note = body.note;
    }
    if (body.scope !== undefined) {
      updates.scope = body.scope;
    }

    ctx.db.update(accounts).set(updates).where(eq(accounts.id, id)).run();
    writeAudit(ctx.db, "account_update", ctx.session.user.id, { accountId: id });

    const account = ctx.db.select().from(accounts).where(eq(accounts.id, id)).get()!;
    const cardRows = ctx.db.select().from(cards).where(eq(cards.settlementAccountId, id)).all();
    return NextResponse.json({
      account: mapAccount(account),
      cards: cardRows.map(mapCard),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

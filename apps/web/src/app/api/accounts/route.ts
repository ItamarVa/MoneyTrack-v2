import {
  AccountCreateRequestSchema,
} from "@moneytrack/contracts";
import { accounts, eq } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { isManualInstitution } from "@/server/manual";
import { mapAccount } from "@/server/mappers";
import { writeAudit } from "@/server/auth";
import { zodErrorResponse } from "@/server/api-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function nowIso(): string {
  return new Date().toISOString();
}

export async function GET(): Promise<Response> {
  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const rows = ctx.db.select().from(accounts).all();
  return NextResponse.json({ accounts: rows.map(mapAccount) });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertValidOrigin(request);
  } catch (response) {
    return response as Response;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  try {
    const body = AccountCreateRequestSchema.parse(await request.json());
    const manual = isManualInstitution(body.institutionCode);

    if (manual && body.kind !== "cash") {
      return NextResponse.json(
        { error: "Manual instruments require kind cash", code: "invalid_kind" },
        { status: 400 },
      );
    }

    const now = nowIso();
    const id = randomUUID();

    ctx.db.insert(accounts).values({
      id,
      kind: body.kind,
      connectionId: null,
      institutionCode: manual ? body.institutionCode : body.institutionCode,
      displayName: body.displayName,
      numberLast4: body.numberLast4 ?? null,
      currency: body.currency,
      ownerPersonId: body.ownerPersonId ?? ctx.session.user.personId,
      note: body.note ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();

    writeAudit(ctx.db, "account_create", ctx.session.user.id, {
      accountId: id,
      institutionCode: body.institutionCode,
      manual,
    });

    const account = ctx.db.select().from(accounts).where(eq(accounts.id, id)).get()!;
    return NextResponse.json({
      account: mapAccount(account),
      cards: [],
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return zodErrorResponse(error as import("zod").ZodError);
    }
    throw error;
  }
}

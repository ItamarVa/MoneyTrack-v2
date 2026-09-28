import {
  PeopleListResponseSchema,
  PersonCreateRequestSchema,
} from "@moneytrack/contracts";
import { eq, people } from "@moneytrack/db";
import { randomUUID } from "node:crypto";
import { assertValidOrigin } from "@/server/csrf";
import { guardApi } from "@/server/guard-api";
import { mapPerson } from "@/server/mappers";
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

  const rows = ctx.db.select().from(people).all();
  const body = PeopleListResponseSchema.parse({
    people: rows.map(mapPerson),
  });
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
    const body = PersonCreateRequestSchema.parse(await request.json());
    const now = nowIso();
    const id = randomUUID();

    ctx.db.insert(people).values({
      id,
      displayName: body.displayName,
      isChild: body.isChild,
      createdAt: now,
      updatedAt: now,
    }).run();

    writeAudit(ctx.db, "person_create", ctx.session.user.id, { personId: id });

    const row = ctx.db.select().from(people).where(eq(people.id, id)).get()!;
    return NextResponse.json(mapPerson(row), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return zodErrorResponse(error);
    throw error;
  }
}

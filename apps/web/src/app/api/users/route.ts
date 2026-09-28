import { HouseholdUsersListResponseSchema } from "@moneytrack/contracts";
import { users } from "@moneytrack/db";
import { NextResponse } from "next/server";
import { guardApi } from "@/server/guard-api";
import { haModeOnly } from "@/server/ha-api";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const blocked = haModeOnly();
  if (blocked) {
    return blocked;
  }

  const ctx = await guardApi();
  if (ctx instanceof Response) {
    return ctx;
  }

  const rows = ctx.db
    .select()
    .from(users)
    .all()
    .filter((row) => row.haUserId);
  const body = HouseholdUsersListResponseSchema.parse({
    currentUserId: ctx.session.user.id,
    users: rows.map((row) => ({
      id: row.id,
      username: row.username,
      haUserId: row.haUserId,
      enrolled: Boolean(row.pinHash),
      pinLocked: Boolean(row.pinLockedAt),
    })),
  });
  return NextResponse.json(body);
}

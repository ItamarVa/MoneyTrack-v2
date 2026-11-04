import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { MoneyTrackDb } from "@moneytrack/db";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth";
import { getServerDb } from "@/server/db";
import {
  HA_PIN_IDLE_MS,
  assertSessionMatchesHaUser,
  maybeApplyClearLockouts,
  resolveHaPhase,
  resolvePreUnlockPhase,
} from "@/server/ha-auth";
import { readHaIdentity } from "@/server/ha-identity";
import { isHaAddonMode } from "@/server/runtime-mode";

export type ApiSession = {
  sessionId: string;
  user: {
    id: string;
    username: string;
    personId: string;
    mustChangePassword: boolean;
  };
};

export type GuardedApiContext = {
  session: ApiSession;
  db: MoneyTrackDb;
};

export type GuardApiOptions = {
  /**
   * Only the change-password endpoint may run while the account still carries
   * a seeded password; every other route stays closed until it is replaced.
   */
  allowPasswordChange?: boolean;
};

/** Full DB session verification for Node API route handlers. */
export async function guardApi(
  options: GuardApiOptions = {},
): Promise<GuardedApiContext | Response> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const identity = isHaAddonMode() ? readHaIdentity(await headers()) : null;
  const preUnlock = isHaAddonMode() ? resolvePreUnlockPhase(identity) : null;
  if (preUnlock) {
    return NextResponse.json(
      preUnlock === "no_access"
        ? { error: "No access", code: "ha_no_access" }
        : { error: "HA gate required", code: "ha_gate_required", phase: preUnlock },
      { status: preUnlock === "no_access" ? 403 : 401 },
    );
  }
  const db = await getServerDb();

  if (isHaAddonMode()) {
    maybeApplyClearLockouts(db);
    const phase = resolveHaPhase(db, identity, token);
    if (phase === "no_access") {
      return NextResponse.json({ error: "No access", code: "ha_no_access" }, { status: 403 });
    }
    if (phase !== "unlocked") {
      return NextResponse.json(
        { error: "HA gate required", code: "ha_gate_required", phase },
        { status: 401 },
      );
    }
    if (!identity || !assertSessionMatchesHaUser(db, token, identity)) {
      return NextResponse.json(
        { error: "Unauthorized", code: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const session = getSessionUser(
    db,
    token,
    isHaAddonMode() ? { idleMs: HA_PIN_IDLE_MS } : undefined,
  );

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  if (session.user.mustChangePassword && !options.allowPasswordChange) {
    return NextResponse.json(
      { error: "Password change required", code: "password_change_required" },
      { status: 403 },
    );
  }

  return { session, db };
}

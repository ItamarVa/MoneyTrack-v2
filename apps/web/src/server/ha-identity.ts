/**
 * Home Assistant ingress identity from Supervisor-injected headers.
 * Only trusted when MONEYTRACK_MODE=ha-addon (nginx strips client spoofing).
 */
import { isHaAddonMode } from "@/server/runtime-mode";

export const HA_USER_ID_HEADER = "x-remote-user-id";
export const HA_USER_NAME_HEADER = "x-remote-user-name";

export type HaIngressIdentity = {
  haUserId: string;
  haUsername: string;
};

export function readHaIdentity(headers: Headers): HaIngressIdentity | null {
  if (!isHaAddonMode()) {
    return null;
  }
  const haUserId = headers.get(HA_USER_ID_HEADER)?.trim();
  const haUsername = headers.get(HA_USER_NAME_HEADER)?.trim();
  if (!haUserId || !haUsername) {
    return null;
  }
  return { haUserId, haUsername };
}

export function requireHaIdentity(headers: Headers): HaIngressIdentity {
  const identity = readHaIdentity(headers);
  if (!identity) {
    throw new HaIdentityError();
  }
  return identity;
}

export class HaIdentityError extends Error {
  constructor() {
    super("Home Assistant identity headers missing");
    this.name = "HaIdentityError";
  }
}

/**
 * HA add-on allowlist from s6-injected env (JSON array or file path).
 * Dev stub: when unset in ha-addon mode, allow any ingress identity.
 */
import fs from "node:fs";
import { isHaAddonMode } from "@/server/runtime-mode";

let cached: string[] | null | undefined;

function parseAllowlist(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error("MONEYTRACK_ALLOWED_USERS must be a JSON string array");
  }
  return parsed.map((name) => name.trim()).filter(Boolean);
}

export function getAllowedHaUsernames(): string[] | null {
  if (!isHaAddonMode()) {
    return null;
  }
  if (cached !== undefined) {
    return cached;
  }

  const filePath = process.env.MONEYTRACK_ALLOWED_USERS_FILE?.trim();
  if (filePath) {
    cached = parseAllowlist(fs.readFileSync(filePath, "utf8"));
    return cached;
  }

  const inline = process.env.MONEYTRACK_ALLOWED_USERS?.trim();
  if (inline) {
    cached = parseAllowlist(inline);
    return cached;
  }

  // ponytail: dev / local ha-addon without s6 yet — do not block everyone
  cached = null;
  return cached;
}

export function isHaUsernameAllowed(haUsername: string): boolean {
  const list = getAllowedHaUsernames();
  if (list === null) {
    return true;
  }
  return list.includes(haUsername);
}

export function resetAllowedUsersCache(): void {
  cached = undefined;
}

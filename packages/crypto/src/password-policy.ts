/**
 * The checks a new password must survive beyond the length rule in the zod
 * schema. Runs fully offline against a bundled denylist: this app never talks
 * to a password-breach API, because the egress allowlist forbids it and a
 * lookup would leak a hash prefix of the owner's password.
 *
 * Callers: the change-password API route and the admin seed/reset scripts.
 * Every path that writes users.passwordHash must go through checkPassword().
 */
import { COMMON_PASSWORDS } from "./common-passwords.js";

export type PasswordRejection = "too_common" | "too_similar";

export type PasswordCheck =
  | { ok: true }
  | { ok: false; reason: PasswordRejection };

// Lower-cased so that "Password1" is caught by the entry "password1"; a single
// capital is not a meaningful barrier to a cracker running a rule-based attack.
const DENYLIST = new Set(
  COMMON_PASSWORDS.split("\n")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0),
);

/** Terms a password must not be built out of, on top of the caller's username. */
export const APP_TERMS: readonly string[] = ["moneytrack", "money track"];

export function checkPassword(
  password: string,
  context: { username?: string } = {},
): PasswordCheck {
  const normalized = password.trim().toLowerCase();

  if (DENYLIST.has(normalized)) {
    return { ok: false, reason: "too_common" };
  }

  const terms = [...APP_TERMS];
  if (context.username && context.username.length >= 3) {
    terms.push(context.username.toLowerCase());
  }
  if (terms.some((term) => normalized.includes(term))) {
    return { ok: false, reason: "too_similar" };
  }

  return { ok: true };
}

export function isCommonPassword(password: string): boolean {
  return DENYLIST.has(password.trim().toLowerCase());
}

/** Entry count, so tests and the audit trail can prove the list actually loaded. */
export function denylistSize(): number {
  return DENYLIST.size;
}

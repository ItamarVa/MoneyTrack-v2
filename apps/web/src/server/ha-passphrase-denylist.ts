/**
 * HA-only hardening on top of checkPassword(): a common word dressed up with
 * leading/trailing digits and symbols or simple leetspeak (Password1!, !Qwerty123,
 * P@ssw0rd#) is still that word. Every peeling stage is compared, not only the
 * bare core, because the bundled list holds "qwerty123" but not "qwerty".
 * Candidates under 4 characters are never compared, so a short core cannot
 * reject a strong master password. The desktop login keeps plain checkPassword().
 */
import { APP_TERMS, isCommonPassword, type PasswordRejection } from "@moneytrack/crypto";

const MIN_CORE_LENGTH = 4;
const LEET: Record<string, string> = { "@": "a", "0": "o", "3": "e", $: "s" };

/** The value, then each stage of peeling one trailing digit run or symbol run off it. */
function trailingStages(value: string): string[] {
  const stages = [value];
  let current = value;
  for (;;) {
    const next = current.replace(/(?:\p{Nd}+|[^\p{L}\p{Nd}]+)$/u, "");
    if (next === current) {
      return stages;
    }
    stages.push(next);
    current = next;
  }
}

/** "1" is ambiguous (i or l), so it yields both spellings. */
function deLeet(value: string): string[] {
  const base = value.replace(/[@03$]/g, (char) => LEET[char] ?? char);
  return base.includes("1") ? [base.replaceAll("1", "i"), base.replaceAll("1", "l")] : [base];
}

/** Lower-cased forms of the password that are compared against the denylist and forbidden words. */
export function haDenylistCandidates(password: string): string[] {
  const lower = password.toLowerCase();
  const starts = [lower, lower.replace(/^[^\p{L}\p{Nd}]+/u, ""), lower.replace(/^[^\p{L}]+/u, "")];
  const candidates = new Set<string>();
  for (const start of starts) {
    for (const stage of trailingStages(start)) {
      for (const candidate of [stage, ...deLeet(stage)]) {
        if (candidate.length >= MIN_CORE_LENGTH) {
          candidates.add(candidate);
        }
      }
    }
  }
  return [...candidates];
}

export function haDenylistRejection(password: string, haUsername: string): PasswordRejection | null {
  const candidates = haDenylistCandidates(password);
  if (candidates.some((candidate) => isCommonPassword(candidate))) {
    return "too_common";
  }
  const terms = haUsername.length >= 3 ? [...APP_TERMS, haUsername.toLowerCase()] : [...APP_TERMS];
  return candidates.some((candidate) => terms.some((term) => candidate.includes(term))) ? "too_similar" : null;
}

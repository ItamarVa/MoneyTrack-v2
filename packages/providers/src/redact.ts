/**
 * Strips secrets out of any text that leaves the scraper for storage or logs.
 * A Puppeteer failure quotes whatever was on the page or in the form, so the
 * raw message can carry a bank password, an OTP or a full account number, and
 * scrape_runs.error_message_redacted is read back by the UI.
 *
 * Invariant: every value written to error_message_redacted, and every operator
 * log line derived from a scrape, passes through redactLogMessage() first.
 * Pass the credential values in whenever the caller has them - pattern matching
 * alone cannot recognise an arbitrary password.
 */

/** Sensitive keys whose value is dropped wherever the text reads key=value. */
const SECRET_KEYS =
  "password|passwd|pass|token|secret|otp|otpcode|pin|code|apikey|api_key|credential|authorization|cookie|userpass|id_?number";

// The optional quote after the key catches the JSON form a fetch failure dumps,
// {"cookie":"..."}, as well as the plain password=... of a form error.
const KEY_VALUE = new RegExp(`\\b(${SECRET_KEYS})\\b["']?\\s*[:=]\\s*("[^"]*"|'[^']*'|\\S+)`, "gi");
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const OPAQUE_TOKEN = /\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g;
const LONG_DIGITS = /\d{6,}/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const REDACTED = "[redacted]";
const PARK_MARK = "\uE000";
const PARKED = /\uE000(\d+)\uE000/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Account and card numbers stay identifiable by their last four digits, which
 * the database already stores in the clear as accounts.number_last4. */
function maskDigits(run: string): string {
  return `${"*".repeat(Math.max(run.length - 4, 3))}${run.slice(-4)}`;
}

export function redactLogMessage(
  message: string,
  secrets: readonly string[] = [],
): string {
  let text = message;

  // Known credential values first: once the generic rules have rewritten the
  // surrounding text, an exact-value match may no longer be findable.
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (!trimmed || trimmed.length < 4) {
      continue;
    }
    text = text.replace(new RegExp(escapeRegExp(trimmed), "gi"), REDACTED);
  }

  // Run and connection ids are the only handle an operator has on a failed
  // sync, so they are parked out of reach of the digit and token rules. The
  // marker is a private-use codepoint: no bank or Puppeteer message contains it.
  const parked: string[] = [];
  text = text.replace(UUID, (uuid) => {
    parked.push(uuid);
    return `${PARK_MARK}${parked.length - 1}${PARK_MARK}`;
  });

  text = text
    .replace(KEY_VALUE, (_match, key: string) => `${key}=${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(OPAQUE_TOKEN, REDACTED)
    .replace(LONG_DIGITS, maskDigits);

  return text.replace(PARKED, (_match, index: string) => parked[Number(index)] ?? "");
}

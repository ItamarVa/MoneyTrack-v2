/**
 * Maps a failed sync's error class to a plain Hebrew "what happened + what to do" message.
 * Why: job rows and scrape runs carry raw codes (INVALID_PASSWORD, SCRAPE_EXCEPTION...) that a
 * non-technical user must never see. Known classes come from israeli-bank-scrapers' ScraperErrorTypes,
 * the sync runner (CREDENTIALS_MISSING, SCRAPE_EXCEPTION, SYNC_FAILED) and the stub adapter (NOT_IMPLEMENTED).
 * Anything else falls back to the generic message. Copy lives in locales/he.json (`autoSync.errors`).
 */
import { providerLabel } from "@/lib/provider-labels";
import he from "@/locales/he.json";

const messages = he.autoSync.errors;
type MessageKey = keyof typeof messages;

/** Error class -> message key. Aliases share the generic text. */
const CLASS_TO_KEY: Record<string, MessageKey> = {
  CREDENTIALS_MISSING: "CREDENTIALS_MISSING",
  INVALID_PASSWORD: "INVALID_PASSWORD",
  CHANGE_PASSWORD: "CHANGE_PASSWORD",
  ACCOUNT_BLOCKED: "ACCOUNT_BLOCKED",
  TWO_FACTOR_RETRIEVER_MISSING: "TWO_FACTOR_RETRIEVER_MISSING",
  TIMEOUT: "TIMEOUT",
  SCRAPE_EXCEPTION: "SCRAPE_EXCEPTION",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  GENERIC: "GENERIC",
  GENERAL_ERROR: "GENERIC",
  SYNC_FAILED: "GENERIC",
};

export const KNOWN_SYNC_ERROR_CLASSES = Object.keys(CLASS_TO_KEY);

export type SyncErrorMessage = { what: string; todo: string; text: string };

export function describeSyncError(
  errorClass: string | null | undefined,
  providerCode: string,
): SyncErrorMessage {
  const key: MessageKey = (errorClass && CLASS_TO_KEY[errorClass]) || "GENERIC";
  const provider = providerLabel(providerCode);
  const what = messages[key].what.replace("{provider}", provider);
  const todo = messages[key].todo;
  return { what, todo, text: `${what} ${todo}` };
}

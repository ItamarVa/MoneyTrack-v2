import { createHash, randomUUID } from "node:crypto";
import { normalizeMerchant } from "@moneytrack/classify";
import {
  MANUAL_PROVIDER_CODE,
  ManualInstitutionCodeSchema,
  type TransactionCreateRequest,
} from "@moneytrack/contracts";

export function normalizeDescription(raw: string): string {
  return normalizeMerchant(raw);
}

/** Manual rows are exempt from ingest dedup — each entry gets a unique synthetic hash. */
export function buildManualIdentityHash(): string {
  return createHash("sha256").update(`manual:${randomUUID()}`).digest("hex");
}

export function isManualInstitution(code: string): boolean {
  return ManualInstitutionCodeSchema.safeParse(code).success;
}

export function defaultKind(
  direction: TransactionCreateRequest["direction"],
): "expense" | "income" {
  return direction === "debit" ? "expense" : "income";
}

export function manualCredentialRef(connectionId: string): string {
  return `moneytrack/conn/${connectionId}`;
}

export function scraperCredentialRef(connectionId: string): string {
  return `moneytrack/conn/${connectionId}`;
}

export function isManualProviderCode(code: string): boolean {
  return code === MANUAL_PROVIDER_CODE;
}

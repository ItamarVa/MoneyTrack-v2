import { describe, expect, it } from "vitest";
import {
  AccountSchema,
  AnalysisFilterSchema,
  ConnectionSchema,
  JobSchema,
  TransactionSchema,
  UserSchema,
} from "./schema.js";
import { LoginRequestSchema } from "./api.js";

const sampleTransaction = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  firstSeenRawId: null,
  accountId: "550e8400-e29b-41d4-a716-446655440001",
  cardId: "550e8400-e29b-41d4-a716-446655440002",
  identityHash: "a".repeat(64),
  transactionDate: "2026-01-15",
  chargeDate: "2026-02-01",
  status: "posted" as const,
  direction: "debit" as const,
  amountIls: -150.5,
  originalAmount: -150.5,
  originalCurrency: "ILS",
  fxRate: null,
  fxFeeIls: null,
  descriptionRaw: "SUPERMARKET TLV",
  descriptionNormalized: "supermarket tlv",
  merchantId: null,
  kind: "expense" as const,
  purchaseId: null,
  installmentIndex: null,
  installmentTotal: null,
  excludedFromTotals: false,
  exclusionReason: null,
  userNote: null,
  categoryId: null,
  providerCategory: null,
  classificationSource: null,
  reportingPeriod: null,
  reportingPeriodLocked: false,
  createdAt: "2026-01-15T10:00:00+02:00",
  updatedAt: "2026-01-15T10:00:00+02:00",
};

describe("domain schemas", () => {
  it("parses a valid transaction", () => {
    expect(TransactionSchema.parse(sampleTransaction)).toMatchObject({
      amountIls: -150.5,
      kind: "expense",
    });
  });

  it("rejects invalid identity hash", () => {
    expect(() =>
      TransactionSchema.parse({ ...sampleTransaction, identityHash: "short" }),
    ).toThrow();
  });

  it("parses analysis filter with date basis", () => {
    const filter = AnalysisFilterSchema.parse({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      dateBasis: "charge",
    });
    expect(filter.dateBasis).toBe("charge");
  });

  it("parses connection", () => {
    const conn = ConnectionSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440010",
      providerCode: "isracard",
      credentialRef: "moneytrack/conn/isracard-1",
      enabled: true,
      scheduleCron: "0 6 * * *",
      lastRunId: null,
      puppeteerProfileDir: null,
      createdAt: "2026-01-01T00:00:00+02:00",
      updatedAt: "2026-01-01T00:00:00+02:00",
    });
    expect(conn.providerCode).toBe("isracard");
  });

  it("parses job with otp fields", () => {
    const job = JobSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440020",
      kind: "scrape",
      payloadJson: { connectionId: "550e8400-e29b-41d4-a716-446655440010" },
      status: "otp_required",
      otpPrompt: "Enter SMS code",
      otpResponse: null,
      attempts: 1,
      errorClass: null,
      createdAt: "2026-01-01T00:00:00+02:00",
      updatedAt: "2026-01-01T00:00:00+02:00",
    });
    expect(job.status).toBe("otp_required");
  });
});

describe("API schemas", () => {
  it("parses login request with min password length", () => {
    expect(
      LoginRequestSchema.parse({ username: "parent_a", password: "a".repeat(12) }),
    ).toBeTruthy();
  });

  it("rejects short password on login", () => {
    expect(() =>
      LoginRequestSchema.parse({ username: "parent_a", password: "short" }),
    ).toThrow();
  });

  it("parses account kind enum", () => {
    expect(
      AccountSchema.shape.kind.parse("credit_card"),
    ).toBe("credit_card");
  });

  it("parses user without totp", () => {
    const user = UserSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440030",
      personId: "550e8400-e29b-41d4-a716-446655440031",
      username: "parent_a",
      passwordHash: "$argon2id$v=19$m=65536",
      mustChangePassword: false,
      totpSecretEncrypted: null,
      createdAt: "2026-01-01T00:00:00+02:00",
      updatedAt: "2026-01-01T00:00:00+02:00",
    });
    expect(user.totpSecretEncrypted).toBeNull();
  });
});

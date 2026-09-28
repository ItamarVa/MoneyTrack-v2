/**
 * Proves redactLogMessage() strips what a scraper failure can leak before it
 * reaches scrape_runs.error_message_redacted or an operator log. Every case
 * here is wording a real Puppeteer or bank-site failure produces.
 */
import { describe, expect, it } from "vitest";
import { redactLogMessage } from "@moneytrack/providers";

describe("credential values", () => {
  it("removes a password the caller handed in, wherever it appears", () => {
    const message = 'page.type("#password", "Tr0ubador!x") timed out; value was Tr0ubador!x';
    const redacted = redactLogMessage(message, ["Tr0ubador!x"]);
    expect(redacted).not.toContain("Tr0ubador!x");
    expect(redacted).toContain("[redacted]");
  });

  it("matches a credential regardless of case", () => {
    expect(redactLogMessage("login as MyBankPass", ["mybankpass"])).not.toContain("MyBankPass");
  });

  it("ignores a credential too short to be matched safely", () => {
    // A three-character value would rewrite unrelated words in the message.
    expect(redactLogMessage("account abc not found", ["abc"])).toContain("abc");
  });

  it("survives a credential containing regex metacharacters", () => {
    const redacted = redactLogMessage("bad login for a.+b(c)", ["a.+b(c)"]);
    expect(redacted).not.toContain("a.+b(c)");
  });
});

describe("pattern-based redaction", () => {
  it("drops the value of a sensitive key", () => {
    for (const message of [
      "login failed password=hunter2guess",
      "submit otp: 48211990",
      'headers {"cookie":"mt_session=abc"}',
    ]) {
      const redacted = redactLogMessage(message);
      expect(redacted).toContain("[redacted]");
    }
    expect(redactLogMessage("login failed password=hunter2guess")).not.toContain("hunter2guess");
  });

  it("drops a bearer token", () => {
    const redacted = redactLogMessage("GET /api 401 Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("drops a long opaque token", () => {
    const token = "abcdef0123456789abcdef0123456789";
    expect(redactLogMessage(`session token ${token} rejected`)).not.toContain(token);
  });

  it("keeps only the last four digits of an account or card number", () => {
    expect(redactLogMessage("txn 1234567890: insert failed")).toContain("7890");
    expect(redactLogMessage("txn 1234567890: insert failed")).not.toContain("1234567890");
    expect(redactLogMessage("card 4580123412341234 declined")).not.toContain("4580123412341234");
  });
});

describe("operator debuggability", () => {
  it("leaves run and connection ids intact, the only handle on a failed sync", () => {
    const runId = "550e8400-e29b-41d4-a716-446655440000";
    expect(redactLogMessage(`Connection not found: ${runId}`)).toContain(runId);
  });

  it("leaves an ordinary error message alone", () => {
    const safe = "[egress] api.cbs.gov.il/index 200 42ms purpose=cpi_refresh";
    expect(redactLogMessage(safe)).toBe(safe);
  });

  it("keeps a short number such as a year or an amount readable", () => {
    expect(redactLogMessage("no rows for 2026-09 (amount 1234.56)")).toContain("1234.56");
  });
});

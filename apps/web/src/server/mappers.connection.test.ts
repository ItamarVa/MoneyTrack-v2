import { describe, expect, it } from "vitest";
import { ConnectionSchema } from "@moneytrack/contracts";
import { mapConnection } from "./mappers";

const row = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  providerCode: "isracard",
  credentialRef: "moneytrack/conn/550e8400-e29b-41d4-a716-446655440010",
  enabled: true,
  scheduleCron: null,
  lastRunId: null,
  puppeteerProfileDir: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("mapConnection", () => {
  it("copies the derived status fields onto the contract shape", () => {
    const mapped = mapConnection(row, {
      lastSuccessAt: "2026-02-01T08:00:00.000Z",
      credentialsSet: true,
    });
    expect(ConnectionSchema.parse(mapped)).toMatchObject({
      lastSuccessAt: "2026-02-01T08:00:00.000Z",
      credentialsSet: true,
    });
  });

  it("defaults to never synced without credentials when no status is given", () => {
    const mapped = mapConnection(row);
    expect(mapped.lastSuccessAt).toBeNull();
    expect(mapped.credentialsSet).toBe(false);
  });
});

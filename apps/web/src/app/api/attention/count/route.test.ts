import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connections: vi.fn(),
  state: vi.fn(),
  merchants: vi.fn(),
  alerts: vi.fn(),
}));
vi.mock("@/app/api/connections/route", () => ({ GET: mocks.connections }));
vi.mock("@/app/api/sync/auto/route", () => ({ GET: mocks.state }));
vi.mock("@/app/api/classify/uncategorized/route", () => ({ GET: mocks.merchants }));
vi.mock("@/app/api/alerts/route", () => ({ GET: mocks.alerts }));

import { GET } from "./route";

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Synthetic data only.
const conn = (n: number, over = {}) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  providerCode: "isracard",
  enabled: true,
  lastSuccessAt: "2026-11-01T00:00:00.000Z",
  credentialsSet: true,
  ...over,
});

describe("GET /api/attention/count", () => {
  beforeEach(() => {
    mocks.connections.mockResolvedValue(json({ connections: [conn(1), conn(2, { credentialsSet: false })] }));
    mocks.state.mockResolvedValue(json({ connections: [] }));
    mocks.merchants.mockResolvedValue(json({ merchants: [{ merchantId: "m1" }, { merchantId: "m2" }] }));
    mocks.alerts.mockResolvedValue(json({ alerts: [{ status: "open" }] }));
  });

  it("adds sync problems, uncategorized merchants and open alerts", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1 + 2 + 1 });
  });

  it("is zero when everything is fine", async () => {
    mocks.connections.mockResolvedValue(json({ connections: [conn(1)] }));
    mocks.merchants.mockResolvedValue(json({ merchants: [] }));
    mocks.alerts.mockResolvedValue(json({ alerts: [] }));
    expect(await (await GET()).json()).toEqual({ count: 0 });
  });

  it("passes an unauthorized sibling response through", async () => {
    mocks.alerts.mockResolvedValue(json({ error: "Unauthorized" }, 401));
    expect((await GET()).status).toBe(401);
  });
});

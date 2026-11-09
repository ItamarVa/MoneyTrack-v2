import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connections: vi.fn(),
  state: vi.fn(),
  merchants: vi.fn(),
  alerts: vi.fn(),
  reconciliation: vi.fn(),
}));
vi.mock("@/app/api/connections/route", () => ({ GET: mocks.connections }));
vi.mock("@/app/api/sync/auto/route", () => ({ GET: mocks.state }));
vi.mock("@/app/api/classify/uncategorized/route", () => ({ GET: mocks.merchants }));
vi.mock("@/app/api/alerts/route", () => ({ GET: mocks.alerts }));
vi.mock("@/app/api/credit/reconciliation/route", () => ({ GET: mocks.reconciliation }));

import { GET } from "./route";

// Fresh Response per call: a Response body can be read only once.
const json = (body: unknown, status = 200) => () => Response.json(body, { status });

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
    mocks.connections.mockImplementation(json({ connections: [conn(1), conn(2, { credentialsSet: false })] }));
    mocks.state.mockImplementation(json({ connections: [] }));
    mocks.merchants.mockImplementation(json({ merchants: [{ merchantId: "m1" }, { merchantId: "m2" }] }));
    mocks.alerts.mockImplementation(json({ alerts: [{ status: "open" }] }));
    mocks.reconciliation.mockImplementation(json({ today: "2026-11-09", cards: [] }));
  });

  it("counts card-bill problems and ignores a failed check", async () => {
    const month = (m: string, status: string) => ({ month: m, billed: 100, detailed: 90, diff: 10, status, combined: false });
    mocks.reconciliation.mockImplementation(
      json({
        today: "2026-11-09",
        cards: [{ accountId: "a", label: "A", institutionCode: "isracard", months: [month("2026-10", "mismatch"), month("2026-09", "match"), month("2024-01", "no_bill"), month("2026-08", "no_details")] }],
      }),
    );
    expect(await (await GET()).json()).toEqual({ count: 1 + 2 + 1 + 1 });
  });

  it("ignores a failed card-bill check", async () => {
    mocks.reconciliation.mockImplementation(json({ error: "x" }, 500));
    expect(await (await GET()).json()).toEqual({ count: 1 + 2 + 1 });
  });

  it("adds sync problems, uncategorized merchants and open alerts", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1 + 2 + 1 });
  });

  it("is zero when everything is fine", async () => {
    mocks.connections.mockImplementation(json({ connections: [conn(1)] }));
    mocks.merchants.mockImplementation(json({ merchants: [] }));
    mocks.alerts.mockImplementation(json({ alerts: [] }));
    expect(await (await GET()).json()).toEqual({ count: 0 });
  });

  it("passes an unauthorized sibling response through", async () => {
    mocks.alerts.mockImplementation(json({ error: "Unauthorized" }, 401));
    expect((await GET()).status).toBe(401);
  });
});

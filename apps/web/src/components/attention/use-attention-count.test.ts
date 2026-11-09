import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAttentionCount, resetAttentionCountCache } from "./use-attention-count";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/attention/attention-api", () => ({ fetchAttentionCount: vi.fn() }));

describe("loadAttentionCount", () => {
  beforeEach(() => resetAttentionCountCache());

  it("shares one fetch between callers on the same route", async () => {
    const fetcher = vi.fn().mockResolvedValue(3);
    const [a, b] = await Promise.all([
      loadAttentionCount("/dashboard", fetcher, 1000),
      loadAttentionCount("/dashboard", fetcher, 1500),
    ]);
    expect([a, b]).toEqual([3, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches on a new route or after 10 seconds", async () => {
    const fetcher = vi.fn().mockResolvedValue(1);
    await loadAttentionCount("/a", fetcher, 0);
    await loadAttentionCount("/b", fetcher, 100);
    await loadAttentionCount("/b", fetcher, 10_100);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failure", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(2);
    await expect(loadAttentionCount("/a", fetcher, 0)).rejects.toThrow();
    await expect(loadAttentionCount("/a", fetcher, 1)).resolves.toBe(2);
  });
});

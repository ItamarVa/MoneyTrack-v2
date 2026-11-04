import { afterEach, describe, expect, it, vi } from "vitest";
import { setTransactionCategory } from "@/lib/api-client";
import { clearTransactionCategory } from "./category-api";

const TX = "00000000-0000-4000-8000-0000000000aa";
const CAT = "00000000-0000-4000-8000-0000000000bb";

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("category calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("picking a category sends PATCH with the category id", async () => {
    const mock = stubFetch({ transaction: { id: TX, categoryId: CAT } });
    const row = await setTransactionCategory(TX, CAT);
    expect(row.categoryId).toBe(CAT);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/api/transactions/${TX}/category`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ categoryId: CAT });
  });

  it("back to automatic sends DELETE", async () => {
    const mock = stubFetch({ transaction: { id: TX, categoryId: null } });
    await clearTransactionCategory(TX);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/api/transactions/${TX}/category`);
    expect(init.method).toBe("DELETE");
  });

  it("surfaces the server error message", async () => {
    stubFetch({ error: "boom" }, 500);
    await expect(clearTransactionCategory(TX)).rejects.toThrow("boom");
  });
});

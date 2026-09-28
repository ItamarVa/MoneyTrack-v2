/**
 * Agent tick isolation: queued jobs must drain even when reference refresh throws.
 */
import { describe, expect, it, vi } from "vitest";
import type { MoneyTrackDb } from "@moneytrack/db";

vi.mock("./job-processor.js", () => ({
  processQueuedJobs: vi.fn(),
  runAgentReferenceSchedule: vi.fn(),
  getPollIntervalMs: vi.fn(),
}));

import { processQueuedJobs, runAgentReferenceSchedule } from "./job-processor.js";
import { runAgentTick } from "./index.js";

describe("runAgentTick", () => {
  it("processes queued jobs when reference schedule throws", async () => {
    vi.mocked(processQueuedJobs).mockResolvedValue(1);
    vi.mocked(runAgentReferenceSchedule).mockRejectedValue(new Error("reference feed down"));

    const db = {} as MoneyTrackDb;
    await runAgentTick(db);

    const mockedJobs = vi.mocked(processQueuedJobs);
    const mockedSchedule = vi.mocked(runAgentReferenceSchedule);
    expect(mockedJobs).toHaveBeenCalledWith(db);
    expect(mockedSchedule).toHaveBeenCalledWith(db);
    expect(mockedJobs.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSchedule.mock.invocationCallOrder[0]!,
    );
  });
});

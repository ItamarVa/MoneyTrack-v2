/**
 * Shrinks the encrypted SQLite file after retention deletes free pages.
 * Skips VACUUM while a scrape job is running so the agent does not block the web.
 */
import type { MoneyTrackDb } from "./connection.js";
import { getSqlite } from "./connection.js";
import { jobs } from "./schema.js";

const FREELIST_RATIO_THRESHOLD = 0.2;

export type CompactResult = {
  compacted: boolean;
  detail: string;
};

export function compactDatabaseIfNeeded(db: MoneyTrackDb): CompactResult {
  const scrapeRunning = db
    .select()
    .from(jobs)
    .all()
    .some((row) => row.kind === "scrape" && row.status === "running");

  if (scrapeRunning) {
    return { compacted: false, detail: "skipped scrape running" };
  }

  const sqlite = getSqlite();
  const pageCount = Number(sqlite.pragma("page_count", { simple: true }));
  const freelist = Number(sqlite.pragma("freelist_count", { simple: true }));

  if (pageCount <= 0 || freelist / pageCount <= FREELIST_RATIO_THRESHOLD) {
    return { compacted: false, detail: `freelist ${freelist}/${pageCount}` };
  }

  sqlite.exec("VACUUM");
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  return { compacted: true, detail: `vacuum freelist was ${freelist}/${pageCount}` };
}

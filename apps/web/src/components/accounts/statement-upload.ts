/**
 * Client-side pre-check for card statement uploads (Isracard/Amex .xlsx).
 * Mirrors the server limits so obvious mistakes never cost a request; the server stays authoritative.
 * Used by connections-section.tsx.
 */
export const STATEMENT_MAX_BYTES = 2 * 1024 * 1024;

const STATEMENT_PROVIDERS: ReadonlySet<string> = new Set(["isracard", "amex"]);

export function supportsStatementUpload(providerCode: string): boolean {
  return STATEMENT_PROVIDERS.has(providerCode);
}

export type StatementFileCheck = "ok" | "type" | "size";

export function checkStatementFile(file: { name: string; size: number }): StatementFileCheck {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return "type";
  }
  return file.size > STATEMENT_MAX_BYTES ? "size" : "ok";
}

/** Oldest first (ties by name): the server keeps the most recently uploaded file per card-month. */
export function sortStatementFiles<T extends { name: string; lastModified: number }>(
  files: readonly T[],
): T[] {
  return [...files].sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name));
}

export function findInvalidStatementFiles<T extends { name: string; size: number }>(
  files: readonly T[],
): { name: string; check: "type" | "size" }[] {
  const bad: { name: string; check: "type" | "size" }[] = [];
  for (const file of files) {
    const check = checkStatementFile(file);
    if (check !== "ok") {
      bad.push({ name: file.name, check });
    }
  }
  return bad;
}

export type StatementUploadResult =
  | { name: string; ingested: number }
  | { name: string; error: string };

export function summarizeStatementUploads(results: readonly StatementUploadResult[]): {
  ingested: number;
  failed: { name: string; error: string }[];
} {
  let ingested = 0;
  const failed: { name: string; error: string }[] = [];
  for (const r of results) {
    if ("error" in r) {
      failed.push({ name: r.name, error: r.error });
    } else {
      ingested += r.ingested;
    }
  }
  return { ingested, failed };
}

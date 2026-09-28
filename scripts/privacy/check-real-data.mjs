#!/usr/bin/env node
/**
 * Real-data leak guard: fails if any of the owner's real values (DB + vault) appears in
 * a file `git add -A` would publish. Mandatory gate before a public snapshot (MEM-PUB).
 * Exit 0 clean, 1 hits (masked), 2 real data unavailable: fails closed, never passes blind.
 * Invariant: real values stay in memory; nothing but masked values is printed or written.
 * Usage: `npm run privacy:check`, or `npm run privacy:check -- --hash "<text>"` for an allowlist line.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowlistKey,
  buildNeedles,
  formatHit,
  parseAllowlist,
  scanText,
  sha256,
} from "./real-data-match.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWLIST_PATH = "scripts/privacy/real-data-allowlist.txt";
const SKIPPED_NAMES = new Set(["package-lock.json"]);

/** Tracked plus untracked-but-not-ignored: exactly what the orphan snapshot stages. */
function listPublishableFiles() {
  const out = execFileSync(
    "git",
    ["-c", "core.quotepath=off", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  const paths = new Set(out.toString("utf8").split("\0").filter(Boolean));
  return [...paths].filter((path) => path !== ALLOWLIST_PATH && !SKIPPED_NAMES.has(basename(path)));
}

/** File text, or null for binaries (NUL in the first 8 KB, as git decides) and deleted files. */
function readTextFile(path) {
  let buffer;
  try {
    buffer = readFileSync(join(ROOT, path));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return buffer.subarray(0, 8000).includes(0) ? null : buffer.toString("utf8");
}

function countByKind(needles) {
  const counts = {};
  for (const kind of [...needles.texts.values(), ...needles.numbers.values()]) {
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");
}

async function runCheck() {
  const { loadRealValues } = await import("./real-data-source.mjs");
  const allow = parseAllowlist(readFileSync(join(ROOT, ALLOWLIST_PATH), "utf8"));
  const needles = buildNeedles(await loadRealValues(), allow);
  if (needles.texts.size + needles.numbers.size === 0) {
    console.error("ERROR: no real values loaded from the database; refusing to report clean.");
    return 2;
  }
  console.log(`Loaded real values: ${countByKind(needles)} (allowlisted: ${allow.size}).`);

  const hits = [];
  let scanned = 0;
  for (const path of listPublishableFiles()) {
    const text = readTextFile(path);
    if (text === null) continue;
    scanned += 1;
    hits.push(...scanText(path, text, needles));
  }
  console.log(`Scanned ${scanned} text files.`);
  if (hits.length === 0) {
    console.log("Real-data leak guard: clean.");
    return 0;
  }
  for (const hit of hits) console.log(`HIT ${formatHit(hit)}`);
  console.error(
    `\nReal-data leak guard FAILED: ${hits.length} hit(s). Replace them with synthetic data.` +
      `\nOnly for a genuinely generic match, add the output of` +
      `\n  npm run privacy:check -- --hash "<exact text from the file>"` +
      `\nto ${ALLOWLIST_PATH}.`,
  );
  return 1;
}

async function main(argv) {
  const hashIndex = argv.indexOf("--hash");
  if (hashIndex !== -1) {
    const text = argv[hashIndex + 1];
    if (!text) {
      console.error('Usage: --hash "<text>"');
      return 2;
    }
    console.log(sha256(allowlistKey(text)));
    return 0;
  }
  return runCheck();
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`ERROR: real data unavailable, guard cannot run: ${error.message}`);
    process.exitCode = 2;
  },
);

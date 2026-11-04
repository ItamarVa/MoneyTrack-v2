#!/usr/bin/env node
/**
 * Memory drift check — index link integrity + satellite staleness.
 * Escape hatch: commit message contains [skip-memory]
 * Staleness needs history: with a single reachable commit (the public orphan snapshot, or a
 * depth-1 clone) every file carries the same date, so only link integrity is checked there.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MEMORY_DIR = join(ROOT, "memory");

function parseFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    if (line.startsWith("owns:")) {
      fm.owns = [];
      continue;
    }
    if (line.startsWith("  - ")) {
      fm.owns = fm.owns ?? [];
      fm.owns.push(line.slice(4).trim());
      continue;
    }
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key && val) fm[key] = val;
    }
  }
  return fm;
}

function getLastCommitDate() {
  try {
    return execSync('git log -1 --format=%cs', { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function skipMemoryCheck() {
  try {
    const msg = execSync("git log -1 --format=%B", { cwd: ROOT, encoding: "utf8" });
    return msg.includes("[skip-memory]");
  } catch {
    return false;
  }
}

function hasSingleCommit() {
  try {
    return execSync("git rev-list --count HEAD", { cwd: ROOT, encoding: "utf8" }).trim() === "1";
  } catch {
    return false;
  }
}

function newestCommitTouchingGlob(glob) {
  try {
    const out = execSync(`git log -1 --format=%cs -- "${glob}"`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function main() {
  if (skipMemoryCheck()) {
    console.log("Memory drift check skipped ([skip-memory] in last commit).");
    process.exit(0);
  }

  const errors = [];
  const indexPath = join(MEMORY_DIR, "INDEX.md");
  if (!existsSync(indexPath)) {
    console.error("memory/INDEX.md not found");
    process.exit(1);
  }

  const indexContent = readFileSync(indexPath, "utf8");
  const linkPattern = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;
  const linkedFiles = new Set();
  let m;
  while ((m = linkPattern.exec(indexContent)) !== null) {
    const file = m[2];
    linkedFiles.add(file);
    const fullPath = join(MEMORY_DIR, file);
    if (!existsSync(fullPath)) {
      errors.push(`INDEX.md links to missing file: ${file}`);
    }
  }

  const satellites = [
    "architecture.md",
    "security.md",
    "data-model.md",
    "ingestion-providers.md",
    "categorization.md",
    "performance.md",
    "lessons.md",
    "invariants.md",
    "design-system.md",
    "decisions.md",
    "publishing.md",
  ];

  for (const sat of satellites) {
    if (!linkedFiles.has(sat)) {
      errors.push(`Orphan satellite not linked from INDEX.md: ${sat}`);
    }
  }

  const checkStaleness = !hasSingleCommit();
  if (!checkStaleness) {
    console.log("Single commit in history: satellite staleness skipped, link integrity still checked.");
  }

  for (const sat of checkStaleness ? satellites : []) {
    const fullPath = join(MEMORY_DIR, sat);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, "utf8");
    const fm = parseFrontmatter(content);
    const lastUpdated = fm.last_updated;
    if (!lastUpdated) {
      errors.push(`${sat}: missing last_updated in frontmatter`);
      continue;
    }
    const owns = fm.owns ?? [];
    for (const glob of owns) {
      const newest = newestCommitTouchingGlob(glob);
      if (newest && newest > lastUpdated) {
        errors.push(
          `memory/${sat} is stale — code in ${glob} changed (${newest}) after last_updated (${lastUpdated})`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error("Memory drift check FAILED:\n");
    for (const e of errors) console.error(`  - ${e}`);
    console.error("\nFix the satellite or add [skip-memory] to commit message.");
    process.exit(1);
  }

  console.log(`Memory drift check passed (${getLastCommitDate()}).`);
}

main();

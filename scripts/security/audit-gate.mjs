#!/usr/bin/env node
/**
 * CI gate over `npm audit`: fails on any high/critical advisory except those accepted in
 * security/audit-accepted.json (GHSA id, package, reason, reviewBy). An accepted entry whose
 * reviewBy date has passed fails the gate, so an acceptance cannot silently become permanent.
 * Chain entries (packages that only depend on a vulnerable package) are covered by their root
 * advisory. Fails closed when npm audit output cannot be parsed. Rationale: MEM-SEC.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BLOCKING = new Set(["high", "critical"]);
const today = new Date().toISOString().slice(0, 10);

const accepted = JSON.parse(readFileSync(join(ROOT, "security/audit-accepted.json"), "utf8"));
const errors = [];
const acceptedIds = new Set();
for (const entry of accepted) {
  if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(entry.id) || !entry.reason) {
    errors.push(`audit-accepted.json: malformed entry ${JSON.stringify(entry)}`);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy ?? "") || entry.reviewBy < today) {
    errors.push(`${entry.id} (${entry.package}): acceptance review date ${entry.reviewBy} has passed — re-evaluate`);
  } else {
    acceptedIds.add(entry.id);
  }
}

// A shell resolves npm.cmd on Windows; the command is a constant, so nothing is interpolated.
const run = spawnSync("npm audit --json", {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: true,
});
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`npm audit produced no JSON (exit ${run.status}):\n${run.stderr}`);
  process.exit(2);
}
if (report.error || !report.vulnerabilities) {
  console.error(`npm audit failed: ${JSON.stringify(report.error ?? report)}`);
  process.exit(2);
}

const seen = new Set();
for (const vuln of Object.values(report.vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === "string" || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split("/").pop() ?? `advisory-${via.source}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (acceptedIds.has(id)) {
      console.log(`accepted: ${id} ${via.severity} ${vuln.name} — ${via.title}`);
    } else {
      errors.push(`${id} ${via.severity} ${vuln.name}: ${via.title} (${via.url})`);
    }
  }
}

if (errors.length > 0) {
  console.error("npm audit gate FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`npm audit gate passed (${seen.size} high/critical advisories, all accepted).`);

#!/usr/bin/env node
/**
 * Resolves HA ingress_entry from the Supervisor API and replaces the build-time
 * placeholder across a fresh copy of the Next standalone tree (see cont-init).
 * Also writes the nginx include that re-adds the ingress prefix: Supervisor
 * strips /api/hassio_ingress/<token> before proxying, but Next serves under it.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INGRESS_PREFIX = "/api/hassio_ingress/";
// Only the token is replaced: Next also stores the base path regex-escaped
// (middleware matcher: "\\/api\\/hassio_ingress\\/<token>"), which a full-path
// match would miss, silently disabling middleware (CSP, HA gate).
const PLACEHOLDER_TOKEN = "__MONEYTRACK_INGRESS_TOKEN__";
const PLACEHOLDER = `${INGRESS_PREFIX}${PLACEHOLDER_TOKEN}`;
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".txt",
  ".css",
  ".map",
  ".rsc",
  ".meta",
  ".body",
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_TEMPLATE = process.env.MONEYTRACK_WEB_TEMPLATE ?? "/moneytrack/web-template";
const WEB_RUNTIME = process.env.MONEYTRACK_WEB_RUNTIME ?? "/moneytrack/web";

async function fetchIngressEntry() {
  const token = process.env.SUPERVISOR_TOKEN;
  const supervisor = process.env.SUPERVISOR ?? "http://supervisor";
  if (!token) {
    console.warn("[apply-base-path] SUPERVISOR_TOKEN missing; leaving placeholder (local smoke only)");
    return PLACEHOLDER;
  }
  const response = await fetch(`${supervisor}/addons/self/info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Supervisor addons/self/info failed: ${response.status}`);
  }
  const payload = await response.json();
  const entry = payload?.data?.ingress_entry;
  if (!entry || typeof entry !== "string") {
    throw new Error("Supervisor response missing data.ingress_entry");
  }
  return entry.endsWith("/") ? entry.slice(0, -1) : entry;
}

/** Token part of ingress_entry; validated because it is spliced into JS, JSON and regex sources. */
function ingressToken(entry) {
  const token = entry.startsWith(INGRESS_PREFIX) ? entry.slice(INGRESS_PREFIX.length) : "";
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error(`Unexpected ingress_entry format: ${entry}`);
  }
  return token;
}

function shouldScanFile(name) {
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return false;
  }
  return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function replaceInTree(root, from, to) {
  if (!existsSync(root)) {
    return;
  }
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    // lstat: symlinked node_modules entries point back into this tree and are scanned there.
    const info = lstatSync(path);
    if (info.isDirectory()) {
      replaceInTree(path, from, to);
      continue;
    }
    if (!info.isFile() || !shouldScanFile(name)) {
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (!text.includes(from)) {
      continue;
    }
    writeFileSync(path, text.split(from).join(to), "utf8");
  }
}

function syncWebTree() {
  // Start clean so a container restart never copies onto an already-rewritten tree.
  rmSync(WEB_RUNTIME, { recursive: true, force: true });
  mkdirSync(dirname(WEB_RUNTIME), { recursive: true });
  // verbatimSymlinks keeps Next's relative .next/node_modules links resolving inside WEB_RUNTIME.
  cpSync(WEB_TEMPLATE, WEB_RUNTIME, { recursive: true, verbatimSymlinks: true });
}

async function main() {
  const ingress = await fetchIngressEntry();
  const token = ingressToken(ingress);
  console.log(`[apply-base-path] ingress_entry=${ingress}`);
  syncWebTree();
  replaceInTree(WEB_RUNTIME, PLACEHOLDER_TOKEN, token);
  const envPath = "/run/moneytrack/base-path.env";
  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(
    envPath,
    `export NEXT_PUBLIC_MONEYTRACK_BASE_PATH='${ingress.replace(/'/g, "'\\''")}'\n`,
    "utf8",
  );
  // Built from the validated token, never from the X-Ingress-Path request header.
  writeFileSync(
    "/run/moneytrack/ingress-path.conf",
    `set $moneytrack_ingress_path ${INGRESS_PREFIX}${token};\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error("[apply-base-path] fatal:", error);
  process.exit(1);
});

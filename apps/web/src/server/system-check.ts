/**
 * Operator-facing health probes for settings / HA add-on support.
 * Missing optional deps (Chromium, vault) surface as skipped, not hard failures.
 */
import { access, stat, statfs } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SystemCheckItem, SystemCheckResponse } from "@moneytrack/contracts";
import { resolveDataDir, resolveDbPath, users } from "@moneytrack/db";
import { getBasePath } from "@/lib/base-path";
import { isHaAddonEmbedMode } from "@/lib/ha-security-headers";
import type { MoneyTrackDb } from "@moneytrack/db";
import { getRuntimeMode } from "@/server/runtime-mode";

const execFileAsync = promisify(execFile);

async function pathReadable(label: string, target: string | undefined): Promise<SystemCheckItem> {
  if (!target) {
    return { id: "data-dir", label, status: "skipped", detail: "MONEYTRACK_DATA_DIR not set" };
  }
  try {
    await access(target, fsConstants.R_OK | fsConstants.W_OK);
    return { id: "data-dir", label, status: "pass", detail: target };
  } catch {
    return { id: "data-dir", label, status: "fail", detail: `Not readable/writable: ${target}` };
  }
}

async function chromiumCheck(): Promise<SystemCheckItem> {
  const label = "Chromium (scraping)";
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROMIUM_PATH;
  if (fromEnv) {
    try {
      await access(fromEnv, fsConstants.X_OK);
      return { id: "chromium", label, status: "pass", detail: fromEnv };
    } catch {
      return { id: "chromium", label, status: "fail", detail: `Not executable: ${fromEnv}` };
    }
  }
  if (process.platform === "win32") {
    for (const bin of ["chromium", "chrome"]) {
      try {
        const { stdout } = await execFileAsync("where.exe", [bin]);
        const first = stdout.trim().split(/\r?\n/)[0];
        if (first) {
          return { id: "chromium", label, status: "pass", detail: first };
        }
      } catch {
        // try next
      }
    }
  } else {
    for (const bin of ["chromium", "chromium-browser", "google-chrome"]) {
      try {
        await execFileAsync("which", [bin]);
        return { id: "chromium", label, status: "pass", detail: bin };
      } catch {
        // try next
      }
    }
  }
  return {
    id: "chromium",
    label,
    status: "skipped",
    detail: "No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH in the container)",
  };
}

async function vaultCheck(): Promise<SystemCheckItem> {
  const label = "Credential vault";
  try {
    const { loadSecret, MASTER_KEY_TARGET } = await import("@moneytrack/vault");
    await loadSecret(MASTER_KEY_TARGET);
    return { id: "vault", label, status: "pass" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return { id: "vault", label, status: "warn", detail: "Master key not enrolled yet" };
    }
    return { id: "vault", label, status: "skipped", detail: message.slice(0, 120) };
  }
}

function ingressBaseCheck(): SystemCheckItem {
  const label = "Ingress base path";
  const configured = process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH ?? "";
  // No placeholder comparison: apply-base-path rewrites that literal too, and a
  // failed rewrite stops the container in cont-init before the web starts.
  if (!configured) {
    return {
      id: "ingress-base",
      label,
      status: isHaAddonEmbedMode() ? "warn" : "pass",
      detail: isHaAddonEmbedMode()
        ? "No ingress base path configured"
        : "Dev mode (no ingress prefix)",
    };
  }
  const active = getBasePath();
  return {
    id: "ingress-base",
    label,
    status: active ? "pass" : "warn",
    detail: active || configured,
  };
}

const ONE_GIB = 1024 ** 3;

function formatBytes(bytes: number): string {
  if (bytes >= ONE_GIB) {
    return `${(bytes / ONE_GIB).toFixed(2)} GB`;
  }
  return `${Math.round(bytes / (1024 ** 2))} MB`;
}

async function storageCheck(): Promise<SystemCheckItem> {
  const label = "Storage";
  const dataDir = resolveDataDir();
  const dbPath = resolveDbPath(dataDir);
  try {
    const dbStat = await stat(dbPath);
    const fsInfo = await statfs(dataDir);
    const freeBytes = fsInfo.bavail * fsInfo.bsize;
    const detail = `DB ${formatBytes(dbStat.size)}; free ${formatBytes(freeBytes)} on data volume`;
    const status = freeBytes < ONE_GIB ? "warn" : "pass";
    return { id: "storage", label, status, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: "storage", label, status: "fail", detail: message.slice(0, 160) };
  }
}

export async function runSystemChecks(db: MoneyTrackDb): Promise<SystemCheckResponse> {
  const items: SystemCheckItem[] = [];

  items.push({
    id: "runtime-mode",
    label: "Runtime mode",
    status: "pass",
    detail: getRuntimeMode(),
  });

  items.push({
    id: "framing-policy",
    label: "HA iframe headers",
    status: "pass",
    detail: isHaAddonEmbedMode() ? "CSP frame-ancestors self; no XFO" : "DENY framing",
  });

  try {
    db.select({ id: users.id }).from(users).limit(1).all();
    items.push({ id: "database", label: "Database", status: "pass" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    items.push({ id: "database", label: "Database", status: "fail", detail: message });
  }

  items.push(await pathReadable("Data directory", process.env.MONEYTRACK_DATA_DIR));
  items.push(ingressBaseCheck());
  items.push(await vaultCheck());
  items.push(await chromiumCheck());
  items.push(await storageCheck());

  return {
    ranAt: new Date().toISOString(),
    items,
  };
}

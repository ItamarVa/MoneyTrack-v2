import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLOUD_SYNC_SEGMENTS = [
  "onedrive",
  "dropbox",
  "google drive",
  "icloud",
  "icloudrive",
];

export class StartupGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupGuardError";
  }
}

function normalizedPath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}

export function isCloudSyncedPath(targetPath: string): boolean {
  const normalized = normalizedPath(targetPath);
  return CLOUD_SYNC_SEGMENTS.some(
    (segment) =>
      normalized.includes(`/${segment}/`) ||
      normalized.includes(`/${segment}`) ||
      normalized.endsWith(`/${segment}`) ||
      normalized.startsWith(`${segment}/`),
  );
}

/** Loopback bind host for startup guards (explicit in Docker / HA add-on). */
export function resolveBindHost(override?: string): string {
  const fromEnv = process.env.MONEYTRACK_BIND_HOST?.trim();
  if (override !== undefined && override !== "") {
    return override.trim();
  }
  if (fromEnv) {
    return fromEnv;
  }
  const hostname = process.env.HOSTNAME?.trim();
  if (hostname) {
    return hostname;
  }
  return "127.0.0.1";
}

export function isInsideGitWorkTree(targetPath: string): boolean {
  let dir = path.resolve(targetPath);
  const root = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return true;
    }
    if (dir === root) {
      return false;
    }
    dir = path.dirname(dir);
  }
}

/** Belt-and-braces: make the data dir uncommittable even if it sits in a work tree. */
function sealDataDirFromGit(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const ignoreFile = path.join(dataDir, ".gitignore");
  if (!fs.existsSync(ignoreFile)) {
    fs.writeFileSync(ignoreFile, "*\n", "utf8");
  }
}

export function assertSafeDataDir(dataDir: string): void {
  const resolved = path.resolve(dataDir);
  const allowUnsafeLocation =
    process.env.MONEYTRACK_ALLOW_CLOUD_DATA === "1";

  if (isCloudSyncedPath(resolved) && !allowUnsafeLocation) {
    throw new StartupGuardError(
      `Data directory must not be in a cloud-sync folder: ${resolved} (set MONEYTRACK_ALLOW_CLOUD_DATA=1 only for local testing)`,
    );
  }
  if (isInsideGitWorkTree(resolved)) {
    if (!allowUnsafeLocation) {
      throw new StartupGuardError(
        `Data directory must not be inside a git work tree: ${resolved}`,
      );
    }
    sealDataDirFromGit(resolved);
  }
}

export function assertLoopbackBind(hostname: string | undefined): void {
  const host = (hostname ?? "127.0.0.1").trim().toLowerCase();
  if (host === "0.0.0.0" || host === "::" || host === "[::]") {
    throw new StartupGuardError(
      `Web server must bind 127.0.0.1 only, not ${host}`,
    );
  }
}

export type BitLockerStatus = "on" | "off" | "unknown";

export function getBitLockerStatus(drive = "C:"): BitLockerStatus {
  if (process.platform !== "win32") {
    return "unknown";
  }
  try {
    const output = execSync(`manage-bde -status ${drive}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).toLowerCase();
    if (output.includes("protection on")) {
      return "on";
    }
    if (output.includes("protection off") || output.includes("fully decrypted")) {
      return "off";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Fail in production when BitLocker is off; warn in dev. */
export function assertBitLockerIfRequired(): void {
  const status = getBitLockerStatus();
  if (status === "on" || status === "unknown") {
    if (status === "unknown" && process.env.NODE_ENV === "production") {
      process.stderr.write(
        "[startup] Warning: could not verify BitLocker status on system drive\n",
      );
    }
    return;
  }
  const message =
    "BitLocker is not enabled on the system drive. Full-disk encryption is required for MoneyTrack.";
  if (process.env.NODE_ENV === "production") {
    throw new StartupGuardError(message);
  }
  process.stderr.write(`[startup] Warning: ${message}\n`);
}

export function runStartupGuards(options: {
  dataDir: string;
  bindHost?: string;
}): void {
  assertSafeDataDir(options.dataDir);
  assertLoopbackBind(resolveBindHost(options.bindHost));
  assertBitLockerIfRequired();
}

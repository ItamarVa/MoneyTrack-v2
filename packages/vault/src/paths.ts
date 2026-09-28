/**
 * Data directory resolution for file-backed vault (mirrors @moneytrack/db paths without a circular import).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findMonorepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.parse(dir).root;
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          name?: string;
          workspaces?: unknown;
        };
        if (pkg.name === "moneytrack" || pkg.workspaces) {
          return dir;
        }
      } catch {
        // keep walking
      }
    }
    if (dir === root) {
      break;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export function defaultDataDir(): string {
  return path.join(path.dirname(findMonorepoRoot()), "data");
}

export function resolveDataDir(override?: string): string {
  return path.resolve(
    override ?? process.env.MONEYTRACK_DATA_DIR ?? defaultDataDir(),
  );
}

export function resolveSecretsDir(dataDir?: string): string {
  return path.join(resolveDataDir(dataDir), "secrets");
}

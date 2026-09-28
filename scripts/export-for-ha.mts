/**
 * Windows export for Home Assistant: VACUUM INTO + one-time export passphrase.
 * Invoked by Export-For-HomeAssistant.bat (install root).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { installEgressGuard } from "@moneytrack/egress";
import {
  defaultDataDir,
  exportDatabaseForHaTransfer,
  HA_IMPORT_FILENAME,
  resolveDbPath,
} from "@moneytrack/db";
import { getOrCreateMasterKey } from "@moneytrack/vault";

function report(progress: number, message: string): void {
  process.stdout.write(`PROGRESS:${progress}:${message}\n`);
}

function parseArgs(argv: string[]): { outputDir: string } {
  let outputDir = path.join(path.dirname(defaultDataDir()), "moneytrack-import");
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output-dir" && argv[index + 1]) {
      outputDir = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return { outputDir };
}

function generateExportPassphrase(): string {
  return randomBytes(24).toString("base64url");
}

async function main(): Promise<number> {
  installEgressGuard();
  const { outputDir } = parseArgs(process.argv.slice(2));
  const sourceDbPath = resolveDbPath();
  if (!fs.existsSync(sourceDbPath)) {
    console.error(`ERROR: Database not found at ${sourceDbPath}`);
    return 1;
  }

  report(5, "Loading encryption key");
  const sourceKey = await getOrCreateMasterKey();

  report(20, "Preparing export folder");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, HA_IMPORT_FILENAME);
  const exportPassphrase = generateExportPassphrase();

  report(45, "Copying database (VACUUM INTO)");
  exportDatabaseForHaTransfer({
    sourceDbPath,
    sourceKey,
    outputPath,
    exportPassphrase,
  });

  report(95, "Export complete");
  console.log("");
  console.log("=== MoneyTrack Home Assistant export ===");
  console.log(`Bundle: ${outputPath}`);
  console.log("");
  console.log("One-time export passphrase (copy now — shown only once):");
  console.log(exportPassphrase);
  console.log("");
  console.log(`EXPORT_PASSPHRASE:${exportPassphrase}`);
  report(100, "Done");
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);

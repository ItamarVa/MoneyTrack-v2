/**
 * Bootstrap local refresh password hash (run once on home PC).
 * Usage: npx tsx scripts/setup-refresh-password.ts
 */
import { createInterface } from "node:readline";
import { setRefreshPassword, hasRefreshPassword } from "@moneytrack/vault";

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  if (hasRefreshPassword()) {
    console.log("Refresh password already configured in local vault.");
    process.exit(0);
  }
  const fromEnv = process.env.MONEYTRACK_REFRESH_PASSWORD;
  const password = fromEnv ?? await promptHidden("Enter refresh password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  setRefreshPassword(password);
  console.log("Refresh password stored locally (hash only).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Small HA add-on flags persisted beside the DB (recovery ack, clear_lockouts nonce).
 */
import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "@moneytrack/db";

export type HaPersistedState = {
  recoveryKeyAcknowledged: boolean;
  clearLockoutsAppliedNonce?: string;
};

const STATE_FILE = "ha-addon-state.json";

function statePath(): string {
  return path.join(resolveDataDir(), STATE_FILE);
}

export function readHaState(): HaPersistedState {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as HaPersistedState;
    return {
      recoveryKeyAcknowledged: Boolean(parsed.recoveryKeyAcknowledged),
      clearLockoutsAppliedNonce: parsed.clearLockoutsAppliedNonce,
    };
  } catch {
    return { recoveryKeyAcknowledged: false };
  }
}

export function writeHaState(patch: Partial<HaPersistedState>): HaPersistedState {
  const next = { ...readHaState(), ...patch };
  const filePath = statePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, filePath);
  return next;
}

export function clearLockoutsNoncePath(): string {
  return path.join(resolveDataDir(), "ha-clear-lockouts.nonce");
}

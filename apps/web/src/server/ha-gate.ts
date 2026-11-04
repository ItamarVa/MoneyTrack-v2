import type { HaLockPhase } from "@moneytrack/contracts";

export function haGatePath(phase: HaLockPhase): string | null {
  switch (phase) {
    case "unlocked":
      return null;
    case "no_access":
      return "/ha/no-access";
    case "vault_locked":
      return "/ha/unlock";
    case "enrollment_required":
      return "/ha/enroll";
    case "pin_required":
      return "/ha/pin";
    default:
      return "/ha/pin";
  }
}

export const HA_PUBLIC_PATHS = new Set([
  "/ha/enroll",
  "/ha/unlock",
  "/ha/pin",
  "/ha/no-access",
  "/ha/recovery",
]);

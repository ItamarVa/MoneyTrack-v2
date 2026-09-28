/**
 * Distinguishes local dev (password login) from the HA add-on (ingress identity + PIN).
 * Track B gates auth behaviour on isHaAddonMode().
 */

export type MoneyTrackRuntimeMode = "dev" | "ha-addon";

export function getRuntimeMode(): MoneyTrackRuntimeMode {
  return process.env.MONEYTRACK_MODE === "ha-addon" ? "ha-addon" : "dev";
}

export function isHaAddonMode(): boolean {
  return getRuntimeMode() === "ha-addon";
}

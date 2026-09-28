import { afterEach, describe, expect, it } from "vitest";
import { getAllowedHaUsernames, isHaUsernameAllowed, resetAllowedUsersCache } from "./ha-allowed-users.js";

const originalMode = process.env.MONEYTRACK_MODE;
const originalInline = process.env.MONEYTRACK_ALLOWED_USERS;

describe("ha allowed users", () => {
  afterEach(() => {
    process.env.MONEYTRACK_MODE = originalMode;
    process.env.MONEYTRACK_ALLOWED_USERS = originalInline;
    resetAllowedUsersCache();
  });

  it("allows any username when list unset in ha-addon mode", () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    delete process.env.MONEYTRACK_ALLOWED_USERS;
    resetAllowedUsersCache();
    expect(getAllowedHaUsernames()).toBeNull();
    expect(isHaUsernameAllowed("anyone")).toBe(true);
  });

  it("enforces JSON allowlist when configured", () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    process.env.MONEYTRACK_ALLOWED_USERS = '["spouse","owner"]';
    resetAllowedUsersCache();
    expect(isHaUsernameAllowed("owner")).toBe(true);
    expect(isHaUsernameAllowed("kid")).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  HA_USER_ID_HEADER,
  HA_USER_NAME_HEADER,
  readHaIdentity,
} from "./ha-identity.js";

const originalMode = process.env.MONEYTRACK_MODE;

describe("ha identity", () => {
  afterEach(() => {
    process.env.MONEYTRACK_MODE = originalMode;
  });

  it("ignores ingress headers outside ha-addon mode", () => {
    process.env.MONEYTRACK_MODE = "dev";
    const headers = new Headers({
      [HA_USER_ID_HEADER]: "abc",
      [HA_USER_NAME_HEADER]: "owner",
    });
    expect(readHaIdentity(headers)).toBeNull();
  });

  it("reads trusted headers only in ha-addon mode", () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    const headers = new Headers({
      [HA_USER_ID_HEADER]: "user-uuid",
      [HA_USER_NAME_HEADER]: "alex",
    });
    expect(readHaIdentity(headers)).toEqual({
      haUserId: "user-uuid",
      haUsername: "alex",
    });
  });

  it("returns null when headers are incomplete", () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    expect(readHaIdentity(new Headers({ [HA_USER_ID_HEADER]: "x" }))).toBeNull();
  });
});

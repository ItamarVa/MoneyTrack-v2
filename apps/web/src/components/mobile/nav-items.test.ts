import { describe, expect, it } from "vitest";
import he from "@/locales/he.json";
import {
  ATTENTION_HREF,
  BOTTOM_ITEMS,
  MORE_ITEMS,
  SIDEBAR_ITEMS,
  attentionAriaLabel,
  attentionBadgeText,
  isActivePath,
  isMoreActive,
} from "./nav-items";

const hrefs = (items: readonly { href: string }[]) => items.map((i) => i.href);

describe("nav items", () => {
  it("tab bar is dashboard, credit, transactions, attention", () => {
    expect(hrefs(BOTTOM_ITEMS)).toEqual(["/dashboard", "/credit", "/transactions", "/attention"]);
    expect(ATTENTION_HREF).toBe("/attention");
  });

  it("more sheet holds alerts and the remaining screens", () => {
    expect(hrefs(MORE_ITEMS)).toEqual([
      "/alerts",
      "/analysis",
      "/accounts",
      "/classify",
      "/loans",
      "/networth",
      "/settings",
    ]);
    expect(MORE_ITEMS.every((i) => i.description.length > 0)).toBe(true);
  });

  it("sidebar lists attention right after transactions and every route once", () => {
    expect(hrefs(SIDEBAR_ITEMS).slice(0, 2)).toEqual(["/dashboard", "/credit"]);
    expect(hrefs(SIDEBAR_ITEMS).slice(2, 4)).toEqual(["/transactions", "/attention"]);
    expect(hrefs(SIDEBAR_ITEMS)).toContain("/alerts");
    const all = [...hrefs(BOTTOM_ITEMS), ...hrefs(MORE_ITEMS)].sort();
    expect([...hrefs(SIDEBAR_ITEMS)].sort()).toEqual(all);
  });
});

describe("attention badge copy", () => {
  it("shows exact counts up to 99 and 99+ above", () => {
    expect(attentionBadgeText(5)).toBe("5");
    expect(attentionBadgeText(99)).toBe("99");
    expect(attentionBadgeText(100)).toBe("99+");
  });

  it("labels the entry with the count and uses singular for one", () => {
    expect(attentionAriaLabel(0)).toBe(he.nav.items.attention.label);
    expect(attentionAriaLabel(1)).toBe(he.nav.attentionCountOne);
    expect(attentionAriaLabel(5)).toBe(he.nav.attentionCount.replace("{count}", "5"));
  });
});

describe("active matching", () => {
  it("matches the route and its children only", () => {
    expect(isActivePath("/credit", "/credit")).toBe(true);
    expect(isActivePath("/credit/visa", "/credit")).toBe(true);
    expect(isActivePath("/credit-other", "/credit")).toBe(false);
    expect(isActivePath("/dashboard", "/credit")).toBe(false);
  });

  it("highlights more only for sheet routes", () => {
    expect(isMoreActive("/loans")).toBe(true);
    expect(isMoreActive("/settings/security")).toBe(true);
    expect(isMoreActive("/credit")).toBe(false);
    expect(isMoreActive("/alerts")).toBe(true);
    expect(isMoreActive("/attention")).toBe(false);
  });
});

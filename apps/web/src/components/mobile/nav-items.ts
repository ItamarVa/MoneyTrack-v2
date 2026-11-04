/**
 * Single source of truth for app navigation: sidebar, phone tab bar and the "more" sheet.
 * Labels live in locales/he.json under `nav`; order here is the order users see.
 * Invariant: every route appears in SIDEBAR_ITEMS; the tab bar and more sheet split it.
 * Used by sidebar.tsx, bottom-nav.tsx and more-sheet.tsx.
 */
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ChartPie,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Receipt,
  Scale,
  Settings,
  Tag,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import he from "@/locales/he.json";

export type NavItem = {
  href: string;
  /** Full name (sidebar, sheet rows). */
  label: string;
  /** Tab-bar name when the full one is too long. */
  shortLabel: string;
  /** One plain sentence, shown in the more sheet. */
  description: string;
  icon: LucideIcon;
};

const t = he.nav.items;

function item(
  href: string,
  icon: LucideIcon,
  text: { label: string; shortLabel?: string; description?: string },
): NavItem {
  return {
    href,
    icon,
    label: text.label,
    shortLabel: text.shortLabel ?? text.label,
    description: text.description ?? "",
  };
}

/** Route that carries the open-items count badge in the tab bar and sidebar. */
export const ATTENTION_HREF = "/attention";

const dashboard = item("/dashboard", LayoutDashboard, t.dashboard);
const credit = item("/credit", WalletCards, t.credit);
const transactions = item("/transactions", Receipt, t.transactions);
const attention = item(ATTENTION_HREF, ListChecks, t.attention);
const alerts = item("/alerts", Bell, t.alerts);

/** Tab-bar entries; the fifth tab ("more") is added by BottomNav. */
export const BOTTOM_ITEMS: readonly NavItem[] = [dashboard, credit, transactions, attention];

const analysis = item("/analysis", ChartPie, t.analysis);
const accounts = item("/accounts", Landmark, t.accounts);
const classify = item("/classify", Tag, t.classify);
const loans = item("/loans", Scale, t.loans);
const networth = item("/networth", TrendingUp, t.networth);
const settings = item("/settings", Settings, t.settings);

/** Everything behind the "more" tab. */
export const MORE_ITEMS: readonly NavItem[] = [
  alerts,
  analysis,
  accounts,
  classify,
  loans,
  networth,
  settings,
];

/** Desktop sidebar and the phone drawer: credit right after the dashboard, attention after transactions. */
export const SIDEBAR_ITEMS: readonly NavItem[] = [
  dashboard,
  credit,
  transactions,
  attention,
  classify,
  accounts,
  loans,
  analysis,
  alerts,
  networth,
  settings,
];

/** True on the route itself or any child route (but not on a sibling that shares a prefix). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The "more" tab is highlighted when the current page lives in the sheet. */
export function isMoreActive(pathname: string): boolean {
  return MORE_ITEMS.some((i) => isActivePath(pathname, i.href));
}

/** Badge text: exact up to 99, then "99+" so the pill stays small. */
export function attentionBadgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Accessible name for the attention entry while the badge is shown (count > 0). */
export function attentionAriaLabel(count: number): string {
  if (count === 0) return t.attention.label;
  if (count === 1) return he.nav.attentionCountOne;
  return he.nav.attentionCount.replace("{count}", String(count));
}

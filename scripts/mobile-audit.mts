/**
 * Mobile layout audit via Puppeteer (hoisted from israeli-bank-scrapers).
 * Requires a running dev server; skipped in CI unless MOBILE_AUDIT_FORCE=1.
 *
 * Usage:
 *   npm run dev
 *   npx tsx scripts/mobile-audit.mts
 *
 * Env:
 *   MOBILE_AUDIT_BASE_URL — default http://127.0.0.1:3100
 *   MOBILE_AUDIT_SKIP=1 — exit 0 without running
 *   MOBILE_AUDIT_FORCE=1 — run even when CI=true
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeDb, eq, initDb, runMigrations, sessions, users } from "@moneytrack/db";
import puppeteer from "puppeteer";

const BASE = process.env.MOBILE_AUDIT_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const SKIP = process.env.MOBILE_AUDIT_SKIP === "1";
const FORCE = process.env.MOBILE_AUDIT_FORCE === "1";
const USER = process.env.SMOKE_USER ?? "admin";

const VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 812 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 },
] as const;

const ROUTES = ["/dashboard", "/transactions", "/settings"];

const MIN_TOUCH_PX = 44;
const MIN_BODY_FONT_PX = 12;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function bootstrapSessionCookie(): Promise<string> {
  process.env.MONEYTRACK_ALLOW_CLOUD_DATA = process.env.MONEYTRACK_ALLOW_CLOUD_DATA ?? "1";
  const db = await initDb({ skipGuards: false, bindHost: "127.0.0.1" });
  runMigrations();
  const user = db.select().from(users).where(eq(users.username, USER)).get();
  if (!user) {
    closeDb();
    throw new Error(`User ${USER} not found for bootstrap session`);
  }
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.insert(sessions)
    .values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashSessionToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    })
    .run();
  closeDb();
  return `mt_session=${token}`;
}

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status === 302 || res.status === 307;
  } catch {
    return false;
  }
}

type AuditIssue = { route: string; viewport: string; message: string };

async function auditRoute(
  page: import("puppeteer").Page,
  route: string,
  viewport: (typeof VIEWPORTS)[number],
): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  await page.setViewport({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 60_000 });

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollOverflow = doc.scrollWidth - window.innerWidth;
    const bodyFont = body ? parseFloat(getComputedStyle(body).fontSize) : 16;
    const interactives = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, a[href], input, select, textarea, [role='button']",
      ),
    );
    const smallTargets: string[] = [];
    for (const el of interactives) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.width < 44 || rect.height < 44) {
        const label = (el.textContent ?? el.getAttribute("aria-label") ?? el.tagName).trim().slice(0, 40);
        smallTargets.push(label || "control");
      }
    }
    return { scrollOverflow, bodyFont, smallTargets: smallTargets.slice(0, 8) };
  });

  if (metrics.scrollOverflow > 2) {
    issues.push({
      route,
      viewport: viewport.name,
      message: `Horizontal overflow ${metrics.scrollOverflow}px`,
    });
  }
  if (metrics.bodyFont < MIN_BODY_FONT_PX) {
    issues.push({
      route,
      viewport: viewport.name,
      message: `Body font ${metrics.bodyFont}px < ${MIN_BODY_FONT_PX}px`,
    });
  }
  if (metrics.smallTargets.length > 0) {
    issues.push({
      route,
      viewport: viewport.name,
      message: `Touch targets < ${MIN_TOUCH_PX}px: ${metrics.smallTargets.join(", ")}`,
    });
  }
  return issues;
}

async function main(): Promise<void> {
  if (SKIP) {
    process.stdout.write("MOBILE_AUDIT_SKIP=1 — skipped\n");
    return;
  }
  if (process.env.CI === "true" && !FORCE) {
    process.stdout.write("CI without dev server — mobile audit skipped (set MOBILE_AUDIT_FORCE=1 to run)\n");
    return;
  }
  if (!(await serverReachable())) {
    process.stdout.write(`Dev server not reachable at ${BASE} — mobile audit skipped\n`);
    return;
  }

  const cookie = await bootstrapSessionCookie();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setCookie({
    name: "mt_session",
    value: cookie.replace("mt_session=", ""),
    domain: "127.0.0.1",
    path: "/",
  });

  const allIssues: AuditIssue[] = [];
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      process.stdout.write(`Audit ${viewport.name} ${route}\n`);
      allIssues.push(...(await auditRoute(page, route, viewport)));
    }
  }
  await browser.close();

  if (allIssues.length > 0) {
    for (const issue of allIssues) {
      process.stderr.write(`${issue.viewport} ${issue.route}: ${issue.message}\n`);
    }
    throw new Error(`${allIssues.length} mobile audit issue(s)`);
  }
  process.stdout.write("Mobile audit passed.\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

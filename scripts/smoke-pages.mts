/**
 * Smoke-test every app page and key API after login.
 * Usage: MONEYTRACK_ALLOW_CLOUD_DATA=1 MONEYTRACK_DATA_DIR=... npx tsx scripts/smoke-pages.mts
 * Without SMOKE_PASS (or with SMOKE_BOOTSTRAP=1) the session is created via DB.
 *
 * Ingress-prefixed smoke (local nginx or HA proxy — not run in CI):
 *   INGRESS_BASE=/api/hassio_ingress/your-token SMOKE_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/smoke-pages.mts
 * Paths and API calls are prefixed with INGRESS_BASE; Origin stays SMOKE_BASE_URL.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeDb, eq, initDb, runMigrations, sessions, users } from "@moneytrack/db";

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const INGRESS_BASE = (process.env.INGRESS_BASE ?? "").replace(/\/$/, "");

function appPath(path: string): string {
  return INGRESS_BASE ? `${INGRESS_BASE}${path}` : path;
}
const USER = process.env.SMOKE_USER ?? "admin";
const PASS = process.env.SMOKE_PASS ?? "";
const BOOTSTRAP = process.env.SMOKE_BOOTSTRAP === "1";

const FOOD_PARENT_CATEGORY_ID = "00000000-0000-4000-8000-000000000010";

const PAGES = [
  "/dashboard",
  "/transactions",
  "/accounts",
  "/analysis",
  `/categories/${FOOD_PARENT_CATEGORY_ID}?period=2026-09`,
  "/alerts",
  "/networth",
  "/settings",
  "/loans",
  "/classify",
];

const APIS: { method: string; path: string; body?: unknown }[] = [
  { method: "GET", path: "/api/classify/status" },
  { method: "GET", path: "/api/sync" },
  { method: "GET", path: "/api/accounts" },
  { method: "GET", path: "/api/categories" },
  { method: "GET", path: "/api/tags" },
  {
    method: "GET",
    path: "/api/transactions?limit=5&sortBy=date&sortDir=desc&dateBasis=charge&dateFrom=2026-09-01&dateTo=2026-09-30",
  },
  {
    method: "GET",
    path: "/api/transactions?limit=5&sortBy=amount&sortDir=desc&dateBasis=charge&dateFrom=2026-09-01&dateTo=2026-09-30",
  },
  {
    method: "POST",
    path: "/api/analysis/summary",
    body: { dateBasis: "charge", dateFrom: "2026-09-01", dateTo: "2026-09-30" },
  },
  {
    method: "POST",
    path: "/api/analysis/breakdown",
    body: { dateBasis: "charge", dateFrom: "2026-09-01", dateTo: "2026-09-30", dimension: "category", flow: "expense" },
  },
  {
    method: "POST",
    path: "/api/analysis/breakdown",
    body: { dateBasis: "charge", dateFrom: "2026-09-01", dateTo: "2026-09-30", dimension: "person", flow: "income" },
  },
  { method: "GET", path: "/api/dashboard/home" },
  { method: "GET", path: "/api/system-check" },
  {
    method: "GET",
    path: `/api/analysis/categories/${FOOD_PARENT_CATEGORY_ID}?period=2026-09`,
  },
];

function extractCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/mt_session=([^;]+)/);
  return match ? `mt_session=${match[1]}` : null;
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

async function login(): Promise<string> {
  // Seeded passwords are random, so with no SMOKE_PASS supplied the DB route is
  // the only way in; there is no shared default to fall back on.
  if (BOOTSTRAP || !PASS) {
    return bootstrapSessionCookie();
  }
  const res = await fetch(`${BASE}${appPath("/api/auth/login")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const cookie = extractCookie(res.headers.get("set-cookie"));
  if (res.ok && cookie) {
    return cookie;
  }
  if (res.status === 401) {
    process.stdout.write("Login failed — bootstrapping session from DB\n");
    return bootstrapSessionCookie();
  }
  const text = await res.text();
  throw new Error(`Login failed (${res.status}): ${text.slice(0, 200)}`);
}

async function checkPage(cookie: string, path: string): Promise<void> {
  const res = await fetch(`${BASE}${appPath(path)}`, { headers: { Cookie: cookie } });
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`${path} HTTP ${res.status}`);
  }
  if (
    html.includes("Build Error") ||
    html.includes("Application error") ||
    html.includes("Module not found") ||
    html.includes("Something went wrong")
  ) {
    const snippet = html.slice(0, 500).replace(/\s+/g, " ");
    throw new Error(`${path} error page: ${snippet}`);
  }
}

async function checkApi(cookie: string, spec: (typeof APIS)[number]): Promise<void> {
  const res = await fetch(`${BASE}${appPath(spec.path)}`, {
    method: spec.method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: BASE,
    },
    body: spec.body ? JSON.stringify(spec.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${spec.method} ${spec.path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (text.startsWith("<!DOCTYPE") || text.includes("Build Error")) {
    throw new Error(`${spec.method} ${spec.path} returned HTML error`);
  }
}

async function main(): Promise<void> {
  process.stdout.write(
    `Smoke test against ${BASE}${INGRESS_BASE ? ` (ingress prefix ${INGRESS_BASE})` : ""}\n`,
  );
  const cookie = await login();
  process.stdout.write("Login OK\n");

  for (const path of PAGES) {
    await checkPage(cookie, path);
    process.stdout.write(`OK page ${path}\n`);
  }

  for (const spec of APIS) {
    await checkApi(cookie, spec);
    process.stdout.write(`OK api ${spec.method} ${spec.path.split("?")[0]}\n`);
  }

  process.stdout.write("All smoke checks passed.\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

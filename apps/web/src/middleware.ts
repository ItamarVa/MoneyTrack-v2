import { NextResponse, type NextRequest } from "next/server";
import { cspFrameAncestorsDirective } from "@/lib/ha-security-headers";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { HA_PUBLIC_PATHS } from "@/server/ha-gate";
import { isHaAddonMode } from "@/server/runtime-mode";

const PUBLIC_PAGES = new Set(["/login"]);

/**
 * Every route under the (app) group, plus /change-password. The Edge runtime
 * cannot reach the encrypted database, so this list only buys a fast redirect
 * on a missing cookie; the real check is the DB session lookup in the (app)
 * and change-password layouts. Adding a page here without adding it there
 * would protect nothing.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/accounts",
  "/analysis",
  "/categories",
  "/classify",
  "/entities",
  "/settings",
  "/alerts",
  "/loans",
  "/networth",
  "/change-password",
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced Next.js bootstrap load its own chunks.
    // The dev server additionally needs eval for hot reloading.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // A nonce cannot cover the inline style attributes React writes, and a
    // nonce would disable 'unsafe-inline' entirely, so styles rely on the
    // latter. Script injection stays blocked, which is what matters for XSS.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    cspFrameAncestorsDirective(),
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const nonce = createNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const withCsp = (response: NextResponse): NextResponse => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // HA add-on: no fast redirect. Which gate applies (enroll, unlock, PIN, no
  // access) depends on keyslots.json and the shm key, which only the (app)
  // layout can read; a cookie-less user is not necessarily a PIN user.
  const isHaPublic = HA_PUBLIC_PATHS.has(pathname);
  if (
    !isHaAddonMode() &&
    !PUBLIC_PAGES.has(pathname) &&
    !isHaPublic &&
    isProtectedPage(pathname) &&
    !request.cookies.get(SESSION_COOKIE)?.value
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return withCsp(NextResponse.redirect(loginUrl));
  }

  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

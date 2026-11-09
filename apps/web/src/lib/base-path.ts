/**
 * Ingress sub-path prefix for Home Assistant add-on mode.
 * Build embeds INGRESS_BASE_PLACEHOLDER; container start replaces it in .next (Track C).
 */

export const INGRESS_BASE_PLACEHOLDER = "/api/hassio_ingress/__MONEYTRACK_INGRESS_TOKEN__";

declare global {
  interface Window {
    __MONEYTRACK_BASE_PATH__?: string;
  }
}

function readConfiguredBase(): string {
  if (typeof window !== "undefined" && window.__MONEYTRACK_BASE_PATH__) {
    return window.__MONEYTRACK_BASE_PATH__;
  }
  const fromEnv = process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH ?? "";
  return fromEnv;
}

/**
 * Active ingress prefix without trailing slash; empty in dev.
 * Never compare against INGRESS_BASE_PLACEHOLDER here: apply-base-path rewrites
 * every copy of the placeholder in the bundle, that constant included, so the
 * comparison would always match and drop the prefix. Next's basePath is this
 * same value, so it is the right prefix whether or not it was rewritten yet.
 */
export function getBasePath(): string {
  const raw = readConfiguredBase();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function joinBase(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getBasePath();
  return base ? `${base}${normalized}` : normalized;
}

/** Prefix for REST calls from the browser (fetch ignores Next basePath). */
export function apiUrl(path: string): string {
  return joinBase(path);
}

/** Prefix for static assets and public files under ingress. */
export function assetUrl(path: string): string {
  return joinBase(path);
}

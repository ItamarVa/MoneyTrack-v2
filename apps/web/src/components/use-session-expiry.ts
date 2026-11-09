"use client";

/**
 * Reloads the page when any same-origin /api/ call returns 401, so the server gate
 * (HA PIN / master password / login) takes over instead of the open page showing errors.
 * Why: client-side navigation keeps a stale page alive after the session expires.
 * Gotcha: auth pages are excluded (wrong PIN/password also returns 401); reload fires once.
 */
import { useEffect } from "react";

// Pages where a 401 is an expected form result, not an expired session.
const AUTH_PATH_MARKERS = ["/ha/", "/login", "/change-password"];

export function shouldReloadForExpiredSession(
  status: number,
  requestUrl: string,
  currentPath: string,
): boolean {
  if (status !== 401) {
    return false;
  }
  let path: string;
  try {
    path = new URL(requestUrl, "http://localhost").pathname;
  } catch {
    return false;
  }
  if (!path.includes("/api/")) {
    return false;
  }
  return !AUTH_PATH_MARKERS.some((marker) => currentPath.includes(marker));
}

let reloading = false;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function useSessionExpiry(): void {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch.apply(window, args);
      let sameOrigin = false;
      try {
        sameOrigin = new URL(urlOf(args[0]), window.location.href).origin === window.location.origin;
      } catch {
        // unparsable URL: leave the response alone
      }
      if (
        !reloading &&
        sameOrigin &&
        shouldReloadForExpiredSession(response.status, urlOf(args[0]), window.location.pathname)
      ) {
        reloading = true;
        window.location.reload();
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);
}

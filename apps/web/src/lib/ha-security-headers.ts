/**
 * Frame-embedding policy for dev vs HA ingress iframe.
 * CSP frame-ancestors is set in middleware; X-Frame-Options here for static next.config headers.
 */

export function isHaAddonEmbedMode(): boolean {
  return process.env.MONEYTRACK_MODE === "ha-addon";
}

export function cspFrameAncestorsDirective(): string {
  return isHaAddonEmbedMode() ? "frame-ancestors 'self'" : "frame-ancestors 'none'";
}

/** Headers applied via next.config headers(); XFO DENY in dev, SAMEORIGIN in HA ingress. */
export function buildStaticSecurityHeaders(): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
  ];
  headers.push({
    key: "X-Frame-Options",
    value: isHaAddonEmbedMode() ? "SAMEORIGIN" : "DENY",
  });
  return headers;
}

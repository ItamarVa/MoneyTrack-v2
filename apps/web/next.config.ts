import type { NextConfig } from "next";
import { buildStaticSecurityHeaders } from "./src/lib/ha-security-headers";

// Content-Security-Policy is set per request in middleware.ts, because the
// script nonce must be generated fresh for every response.
const securityHeaders = buildStaticSecurityHeaders();

const isHaAddonBuild = process.env.MONEYTRACK_MODE === "ha-addon";
const ingressBasePath =
  process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH?.trim() ||
  (isHaAddonBuild ? "/api/hassio_ingress/__MONEYTRACK_INGRESS_TOKEN__" : "");

const nextConfig: NextConfig = {
  ...(isHaAddonBuild
    ? {
        output: "standalone" as const,
        basePath: ingressBasePath,
      }
    : {}),
  transpilePackages: [
    "@moneytrack/contracts",
    "@moneytrack/db",
    "@moneytrack/vault",
    "@moneytrack/crypto",
    "@moneytrack/egress",
  ],
  serverExternalPackages: [
    "better-sqlite3-multiple-ciphers",
    "better-sqlite3",
    "@napi-rs/keyring",
    "@node-rs/argon2",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

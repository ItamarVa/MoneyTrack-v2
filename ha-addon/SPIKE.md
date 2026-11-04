# Wave 0 spike — ingress base path, CSRF, Chromium

**Verdict: GO** for the placeholder `basePath` + runtime `apply-base-path` approach. **Fallback** (on-device `next build` on first start) stays documented if a future ingress token shape breaks string replace.

## Next 16 standalone + ingress sub-path

- Next 16 supports `output: "standalone"` and `basePath` (see `apps/web/next.config.ts` — wiring lands in Track C).
- Build with a fixed placeholder (`INGRESS_BASE_PLACEHOLDER` in `apps/web/src/lib/base-path.ts`) and replace it in a copied `.next` tree at container start (`apply-base-path.mjs`, Track C).
- Client API calls must use `apiUrl()` because browser `fetch("/api/…")` ignores Next `basePath` (Wave 0 codemod).
- Static assets (`theme-init.js`, `/brand/*`, metadata icons) use `assetUrl()` for the same reason.

## CSRF Origin vs Host behind ingress

- `assertValidOrigin` compares `Origin` host to `Host` (now prefers `X-Forwarded-Host` when present — first hop only).
- HA Supervisor ingress typically forwards the public `Host` and the browser sends a matching `Origin` on same-origin POSTs; no mismatch observed in local reasoning-only review.
- If a device test fails mutating requests, verify nginx passes `Host` / `X-Forwarded-Host` consistently before widening CSRF rules.

## Chromium in Debian container

- Not exercised on the dev machine (Docker CLI unavailable). Debian `chromium` package on `bookworm-slim` is the intended Track C install path.
- Sandbox vs `--no-sandbox` is **deferred** to Track C container smoke + `scripts/mobile-audit.mts`; expect `--no-sandbox` only if the HA base image lacks user namespaces.

## Local spike gap

- Full nginx + fake `/api/hassio_ingress/<token>/` proxy was not run locally; Track C `smoke-pages.mts` extension should validate end-to-end.

## Wave 2 container smoke (2026-09-26)

- **Docker CLI not available** on the owner dev PC (Windows). No local `docker build` of `ha-addon/moneytrack` image in this integration pass.
- **Substitute:** unit tests (keyslots, vault, ha-auth, middleware headers), extended `scripts/smoke-pages.mts` / container test scripts in repo, and the on-device checklist in `ha-addon/moneytrack/DOCS.md`.
- **When Docker is available:** from repo root, `docker build -f ha-addon/moneytrack/Dockerfile -t moneytrack-ha:local .` then run container smoke per Track F docs.

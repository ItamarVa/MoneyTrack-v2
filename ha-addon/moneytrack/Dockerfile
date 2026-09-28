# syntax=docker/dockerfile:1
# Multi-stage image: build Next standalone + agent on Node 24, run on HA base-debian.
ARG BUILD_FROM=ghcr.io/home-assistant/base-debian:bookworm
ARG BUILD_NODE=node:24-bookworm-slim

FROM ${BUILD_NODE} AS builder

WORKDIR /src

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json tsconfig.json ./

ENV MONEYTRACK_MODE=ha-addon
ENV NEXT_PUBLIC_MONEYTRACK_BASE_PATH=/api/hassio_ingress/__MONEYTRACK_INGRESS_TOKEN__
# The runtime uses Debian's chromium; puppeteer's bundled Chrome is never copied.
ENV PUPPETEER_SKIP_DOWNLOAD=1

RUN npm ci
RUN npm run build

FROM ${BUILD_FROM}

ARG BUILD_ARCH=amd64

RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx chromium \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /moneytrack

COPY --from=builder /src/node_modules ./node_modules
COPY --from=builder /src/packages ./packages
COPY --from=builder /src/apps/agent/dist ./agent/dist
COPY --from=builder /src/apps/agent/package.json ./agent/package.json

# Next standalone layout (static + public copied per Next docs).
COPY --from=builder /src/apps/web/.next/standalone ./web-template
COPY --from=builder /src/apps/web/.next/static ./web-template/apps/web/.next/static
COPY --from=builder /src/apps/web/public ./web-template/apps/web/public
# The bundled @moneytrack/db resolves its migrations from the standalone root,
# and Next's file tracing does not pick up that directory.
COPY --from=builder /src/packages/db/drizzle ./web-template/packages/db/drizzle

COPY ha-addon/moneytrack/scripts ./scripts
RUN chmod +x /moneytrack/scripts/*.sh 2>/dev/null || true

COPY ha-addon/moneytrack/rootfs/ /

RUN chmod +x /etc/cont-init.d/moneytrack.sh \
  && chmod +x /etc/services.d/nginx/run \
  && chmod +x /etc/services.d/moneytrack-web/run \
  && chmod +x /etc/services.d/moneytrack-agent/run \
  && chmod +x /moneytrack/scripts/backup-pre.sh

ENV MONEYTRACK_MODE=ha-addon
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

LABEL org.opencontainers.image.source=https://github.com/ItamarVa/MoneyTrack-v2

# syntax=docker/dockerfile:1
# One image per deployment: NEXT_PUBLIC_* values are inlined at build time, so each Coolify app
# (entx.space, demo.entx.space, solana.entx.space) builds with its own build args.

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_ENTX_MODE=demo
ARG NEXT_PUBLIC_CHAIN=near
ARG NEXT_PUBLIC_FLAG_CHAIN_SWITCH=false
ARG NEXT_PUBLIC_URL_NEAR_LIVE=https://entx.space
ARG NEXT_PUBLIC_URL_NEAR_DEMO=https://demo.entx.space
ARG NEXT_PUBLIC_URL_SOLANA=https://solana.entx.space
ARG NEXT_PUBLIC_NEAR_CONTRACT
ARG NEXT_PUBLIC_NEAR_RPC
ARG NEXT_PUBLIC_SOLANA_RPC
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:3000/ >/dev/null || exit 1
# Docker/Coolify can set HOSTNAME to the container id at runtime, which makes Next bind to that name only. "::" listens on IPv4 and IPv6, so health checks on localhost (::1) reach it.
CMD ["sh", "-c", "HOSTNAME=:: exec node server.js"]

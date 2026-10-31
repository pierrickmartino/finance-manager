# App image, for the web service and the `fx-rates` cron service (same image, different start
# command). Railway builds a root Dockerfile automatically. Build context: repo root.
# Deployment steps: README.md, "Deployment (Railway, EU)".
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# pnpm installed at build time: the scripts call it at runtime, and Corepack would download it
# on first use.
RUN npm install -g pnpm@10.28.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# The build needs no database and no secrets: every page is rendered on request.
RUN pnpm build \
  && pnpm prune --prod \
  && rm -rf .next/cache

FROM base AS runtime
ENV NODE_ENV=production
# Production dependencies only. tsx stays: migrations, `pnpm fx:fetch` and `pnpm auth:reset`
# run the TypeScript scripts in scripts/ (which import src/server) through it.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["sh", "scripts/docker-start.sh"]

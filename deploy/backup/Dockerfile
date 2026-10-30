# Backup service image (see docs/runbooks/backup-and-restore.md). Build context: repo root.
# Node runs scripts/backup/server.ts directly (type stripping, Node built-ins only), next to
# pg_dump and age. PG_MAJOR must equal the Railway Postgres major version (or be newer).
FROM node:22-bookworm-slim

ARG PG_MAJOR=16

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl age \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}" \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scripts/backup/server.ts ./server.ts
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server.ts"]

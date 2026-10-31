#!/bin/sh
# Container start for the web service: apply pending migrations, then serve.
# A failed migration stops the container before it serves, so the health check never passes
# and Railway keeps the previous deployment live.
set -e
: "${DATABASE_URL:?DATABASE_URL is not set. Reference the Postgres service DATABASE_URL variable.}"
: "${TOTP_ENCRYPTION_KEY:?TOTP_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32}"
pnpm db:migrate
# PORT comes from the platform (Railway sets it); next start falls back to 3000.
exec node_modules/.bin/next start --hostname 0.0.0.0

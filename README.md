# Finance Manager

A self-hosted, single-user app for tracking household income and expenses across several Banks and Currencies. It records and reports; it does not budget. See `docs/specs/v1-finance-manager.md` for the spec, `GLOSSARY.md` for the vocabulary and `docs/adr/` for binding decisions.

Stack: Next.js (App Router, TypeScript), Tailwind CSS, PostgreSQL 16, Vitest, Playwright. Deployed on Railway (EU).

## Local setup

Requirements: Node 22, pnpm 10, PostgreSQL 16.

```sh
pnpm install
cp .env.example .env.local          # then point DATABASE_URL at your database
createdb finance_manager            # or any name matching DATABASE_URL
pnpm db:migrate
pnpm dev                            # http://localhost:3000
```

## Tests

| Command | What it runs |
| --- | --- |
| `pnpm test` | Service-layer and unit tests (Vitest) against a real PostgreSQL |
| `pnpm test:coverage` | The same, with coverage (80% line threshold on the service layer) |
| `pnpm test:e2e` | Playwright end-to-end tests against a production build |
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | Static checks |
| `pnpm check` | Lint, format check, typecheck and service tests in one go |

Both harnesses need a PostgreSQL server where user `postgres` can create databases. By default they use `postgresql://postgres:postgres@localhost:5432/postgres`; set `TEST_DATABASE_ADMIN_URL` to use another one. Each run creates its own uniquely named databases (`fm_test_*`, `fm_e2e_*`) and drops them when it ends, so several runs can share one server.

- **Service tests** (`src/**/*.test.ts`): one migrated template database per run; each test file gets its own clone, truncated before every test.
- **E2E tests** (`e2e/*.spec.ts`): the Playwright web server creates a database, migrates it, runs `next build` and `next start` on a random port. Set `E2E_SERVER=dev` to use `next dev` instead while debugging. For a first run, install the browser with `pnpm exec playwright install chromium` (or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium).

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request and on pushes to `main`.

## Database migrations

Migrations are plain SQL files in `migrations/`, applied by [node-pg-migrate](https://salsita.github.io/node-pg-migrate/):

```sh
pnpm db:new-migration create_account   # creates migrations/<UTC timestamp>_create_account.sql
pnpm db:migrate                        # applies pending migrations
pnpm db:migrate:down                   # rolls back the most recent one
```

Each file has an `-- Up Migration` and a `-- Down Migration` section. Migrations run in one transaction, and order checking is off, so migrations from parallel branches apply cleanly in timestamp order.

## Deployment (Railway, EU)

`railway.json` configures the service: build with `pnpm build`, run `pnpm db:migrate` as the pre-deploy step (so migrations apply on every deploy before traffic switches), start with `pnpm start`, health-check `/api/health`, and run in `europe-west4`.

One-time setup:

1. Create a Railway project in an EU region and add a **PostgreSQL** service.
2. Add a service from this GitHub repository. Railway picks up `railway.json`.
3. In the app service's variables, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`.
4. Generate a public domain. Every push to `main` then deploys and migrates.

Backups: a separate `backup` service (`deploy/backup/`) serves age-encrypted dumps that a machine you own pulls nightly. Setup, retention and restore are in `docs/runbooks/backup-and-restore.md`.

FX rates: a separate `fx-rates` cron service (`deploy/fx-rates/railway.json`) runs `pnpm fx:fetch` daily at 16:20 UTC to fetch ECB reference rates. Setup, backfill and the stale-rates warning are in `docs/runbooks/fx-rates.md`.

## Signing in

The app is single-user and reachable on the public internet, so every page and server action needs a session.

- **First run:** open the app and you land on `/setup`. Choose a password (at least 12 characters), scan the QR code with an authenticator app, enter its code, and save the 10 recovery codes shown once. Setup then disables itself for good.
- **Login:** password plus the authenticator code, or a recovery code instead (each works once). After 5 failed attempts within 15 minutes, logins are refused until the failures are 15 minutes old.
- **Sessions** end after 30 minutes without a request, or on *Sign out*.
- **Lost the password or the authenticator?** There is no email reset. Run `pnpm auth:reset` in the app's shell (on Railway: `railway ssh`, then `pnpm auth:reset`). It asks for a new password, prints a new authenticator QR code and secret plus new recovery codes, signs out every session and lifts any login lockout.

## Layout

```
src/app/                 Next.js routes. Pages, server actions and route handlers are thin adapters.
src/components/          Shared UI (form fields, FormatterProvider)
src/lib/format/          The shared amount and date formatter (pure, client and server)
src/server/services/     The application service layer: one folder per domain area
src/server/db/           Pool, transactions, migration runner
migrations/              SQL migrations
test/support/            Service-test harness
e2e/                     Playwright tests and their web server
```

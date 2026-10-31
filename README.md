# Finance Manager

A self-hosted, single-user app for tracking household income and expenses across several Banks and Currencies. It records and reports; it does not budget. See `docs/specs/v1-finance-manager.md` for the spec, `GLOSSARY.md` for the vocabulary and `docs/adr/` for binding decisions.

Stack: Next.js (App Router, TypeScript), Tailwind CSS, PostgreSQL 16, Vitest, Playwright. Deployed on Railway (EU).

## Local setup

Requirements: Node 22, pnpm 10, PostgreSQL 16.

```sh
pnpm install
cp .env.example .env.local          # then point DATABASE_URL at your database and set
                                    # TOTP_ENCRYPTION_KEY (openssl rand -base64 32)
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

The app ships as a plain Docker image, so nothing depends on Railway's deprecated config-as-code files (`railway.json` stops being read on 2026-12-01). Railway builds the root `Dockerfile` automatically. The few settings that used to live in `railway.json` are set once in the service dashboard (the checklists below).

What the image does:

- **Build:** `pnpm install --frozen-lockfile`, `pnpm build`, then prune to production dependencies. The build needs no database and no secrets.
- **Start** (`scripts/docker-start.sh`): check that `DATABASE_URL` and `TOTP_ENCRYPTION_KEY` are set, apply pending migrations (`pnpm db:migrate`), then `next start` on `$PORT`. If a migration fails, the container exits before serving, the health check never passes, and Railway keeps the previous deployment live.

Three services share one Railway project and one Postgres database:

| Service | Image | Runs |
| --- | --- | --- |
| `web` | root `Dockerfile` | the app, always on, public domain |
| `fx-rates` | root `Dockerfile` | `pnpm fx:fetch` once a day (cron), then exits |
| `backup` | `deploy/backup/Dockerfile` | serves encrypted dumps to your pull machine |

### 1. Project and database

1. Create a Railway project. In **Project Settings**, choose an EU region (for example *EU West (Amsterdam)*) as the default for new services.
2. Add a **PostgreSQL** service (New, Database, PostgreSQL). Note its major version (`SELECT version();`); the backup service needs it.

### 2. The `web` service

1. New, **GitHub Repo**, pick this repository. Rename the service `web`. Railway detects the root `Dockerfile` and builds it.
2. **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (the private URL).
   - `TOTP_ENCRYPTION_KEY` = the output of `openssl rand -base64 32`. It encrypts the authenticator secret at rest, and the app refuses to start without it. Keep a copy in your password manager, not next to the backups.
3. **Settings**:
   - Source: branch `main` (or the branch you deploy). Optionally tick *Wait for CI* so a red build never deploys.
   - Deploy, **Healthcheck Path**: `/api/health`. Healthcheck timeout: 120 s, which leaves time for migrations.
   - Deploy, **Regions**: the EU region, **1 replica**.
   - Leave **Custom Start Command** and **Pre-deploy Command** empty: the image migrates and starts by itself.
   - Networking: **Generate Domain** (or add your own domain).
4. Deploy. The logs show `Migrated up: ...`, then `Ready`. Open the domain: the first-run setup screen creates your password and enrols TOTP.

Every push to the deploy branch then rebuilds, migrates and switches traffic once `/api/health` answers.

### 3. The `fx-rates` cron service

Setup and checks: `docs/runbooks/fx-rates.md`. In short: a second service from the same repository, the same `DATABASE_URL`, **Custom Start Command** `pnpm fx:fetch`, **Cron Schedule** `20 16 * * *`, restart policy **Never**, no domain.

### 4. The `backup` service

Setup, key custody, the pull machine and restore: `docs/runbooks/backup-and-restore.md`. In short: a third service from the same repository with the variable `RAILWAY_DOCKERFILE_PATH=deploy/backup/Dockerfile` (or set the Dockerfile path under Settings, Build), its own variables, healthcheck `/health`, one replica, and a public domain for your pull machine.

### Operations

- **Reset credentials:** `railway ssh` into `web` (or use the service's shell), then `pnpm auth:reset`.
- **Run a migration by hand:** not needed; every deploy migrates. To roll back the latest one: `pnpm db:migrate:down` in the service shell.
- **Check the image locally:** `docker build -t finance-manager .`, then `docker run --rm -p 3000:3000 -e DATABASE_URL=... -e TOTP_ENCRYPTION_KEY=... finance-manager`. CI builds both images and smoke-tests the app image on every push.

## Bringing in history before the bank files (Crédit Agricole)

An Account's opening balance is its balance at the start of the opening date, so it already includes everything booked before. Manual transactions dated before the opening date are therefore refused (they would count twice), and the opening date can't move past a Transaction already on the Account.

Recommended order for the Crédit Agricole Account (Manual history from 2021, then OFX files):

1. Create the Account with opening date `2021-01-01` and the balance it had on that day (0 if it opened later).
2. Enter the Manual transactions from 2021 up to the day before the first OFX file's period.
3. Import the OFX files, oldest first. With Manual history present, the first Import checks its derived opening balance against the history instead of replacing the opening balance; a difference means a Manual transaction is missing or wrong.

If an OFX file was imported first (it set the opening balance and date to the file's start), open the Account page and set the opening date back to `2021-01-01` with that day's balance before entering the earlier Manual transactions.

## Signing in

The app is single-user and reachable on the public internet, so every page and server action needs a session.

- **First run:** open the app and you land on `/setup`. Choose a password (at least 12 characters), scan the QR code with an authenticator app, enter its code, and save the 10 recovery codes shown once. Setup then disables itself for good.
- **Login:** password plus the authenticator code, or a recovery code instead (each works once). After 5 failed attempts within 15 minutes, logins are refused until the failures are 15 minutes old.
- **Sessions** end after 30 minutes without a request, or on *Sign out*.
- **Authenticator codes work once.** A code that has signed you in is refused if you try it again, even while your phone still shows it; wait for the next one.
- **Authenticator secret at rest** is encrypted with AES-256-GCM using `TOTP_ENCRYPTION_KEY`. A database set up before this (migration `encrypt_totp_secret`) still holds the secret in plain text: the first successful login after the upgrade encrypts it, or run `pnpm auth:reset` to replace it outright. Set `TOTP_ENCRYPTION_KEY` before deploying the upgrade. If the key is lost or changed, the stored secret can no longer be read: run `pnpm auth:reset`.
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

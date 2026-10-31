# FX rates runbook

How ECB reference rates get into the app, how the daily fetch is scheduled on Railway, and what to do when the Accounts page warns that rates are stale.

## How it works

- Rates come from the ECB Data Portal API (`https://data-api.ecb.europa.eu/service/data/EXR/D.CHF.EUR.SP00.A`, CSV), which publishes euro reference rates on TARGET business days at around 16:00 CET. Nothing is published on weekends and ECB holidays, so a lookup on those days uses the most recent earlier rate.
- `fx_rate(date, currency, rate_to_chf)` holds CHF per unit of each Currency. EUR is the ECB's CHF-per-EUR rate. Any other Account Currency (USD, GBP and so on) is derived from its EUR quote and rounded to 10 decimals. CHF is never stored: its rate is always 1.
- Amounts are never stored in CHF (ADR-0002). Pages and reports convert when they read, rounding half away from zero to the cent.
- FX fetches don't write History (spec story 117). The last fetch is recorded in `fx_fetch_status` and shown on the Accounts page.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm fx:fetch` | The daily job. Fetches from a week before the latest stored rate up to today, so it catches up after missed days and picks up ECB corrections. With no rates yet, or when an Account uses a Currency that has no rates yet, it backfills from 2021-01-01. |
| `pnpm fx:backfill [from] [to]` | Re-fetches a range (ISO dates). The default is 2021-01-01 to today. Each run starts a week before `from`, so the first days of the range have an earlier rate to fall back on. |

Both need `DATABASE_URL`. Both are idempotent: unchanged rates are not rewritten, and a corrected rate replaces the old one. Both exit non-zero on failure and record the error in the rate status.

## Railway: the `fx-rates` cron service

The daily fetch is a separate Railway service that runs on a cron schedule. It uses the app's root `Dockerfile` (the same image as `web`) with a different start command: Railway starts it, runs `pnpm fx:fetch`, and the process exits.

- Schedule: `20 16 * * *`, which is 16:20 UTC every day (17:20 or 18:20 in Zurich), after the ECB publishes in both winter and summer time. Weekend runs fetch nothing new and are harmless.
- Restart policy **Never**: a failed run is not retried in a loop. The next day's run catches up, because it always re-fetches the last week.
- The job runs from source with `tsx`, a runtime dependency kept in the image.

Checklist (only you can do this, in the Railway dashboard):

- [ ] In the Railway project, New, **GitHub Repo**, pick this repository, and name the service `fx-rates`. Railway builds the root `Dockerfile`.
- [ ] **Variables**: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (the private URL). It needs no `TOTP_ENCRYPTION_KEY`.
- [ ] **Settings**, Deploy:
  - **Custom Start Command**: `pnpm fx:fetch` (it replaces the image's default, which would start the web server).
  - **Cron Schedule**: `20 16 * * *`.
  - **Restart Policy**: Never.
  - **Regions**: the EU region, 1 replica.
  - No healthcheck path and no public domain.
- [ ] Optional, under Settings, Source, **Watch Paths**: `scripts/fx-rates.ts`, `src/server/fx/**`, `src/server/services/fx/**`, `src/server/db/**`, `package.json`, `pnpm-lock.yaml`, so unrelated pushes don't rebuild it.
- [ ] The service needs outbound HTTPS to `data-api.ecb.europa.eu`, which Railway allows by default.
- [ ] Deploy it after the `web` service, whose start-up migrations create the `fx_rate` table. On the first run the table is empty, so the job backfills from 2021-01-01. Check the run's logs for a line like `FX rates 2020-12-25 to 2026-10-30: 1520 new, 0 corrected`. To trigger a run without waiting for the schedule, use **Run now** on the cron service if your dashboard offers it, or the command below.
- [ ] Open the Accounts page. The rate status should show the time of that run and no warning.

To run it now rather than wait for the schedule, run `pnpm fx:fetch` locally with `DATABASE_URL` set to the database's public URL (`DATABASE_PUBLIC_URL`).

## When the Accounts page warns that rates are stale

The warning appears when any of these is true:

- No rate has been fetched yet.
- The newest EUR rate is more than 5 days old. The longest normal ECB gap is Easter: no rates from Thursday until Tuesday afternoon.
- No fetch has succeeded for 48 hours.

To fix it:

1. Read the "last attempt failed" message next to the warning, and the `fx-rates` service's logs in Railway.
2. If the cron service is missing or paused, set it up as described above.
3. If the ECB was unreachable, wait for the next run, or run `pnpm fx:fetch` by hand. It catches up on its own.
4. If a range is missing or wrong (for example after restoring an old backup), run `pnpm fx:backfill <from> <to>`.

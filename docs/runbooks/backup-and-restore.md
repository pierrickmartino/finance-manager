# Backup and restore runbook

Nightly encrypted backups of the production database, pulled onto a machine you own, and the steps to restore one.

## How it works

```
Railway project (EU)                                     Your always-on machine
┌──────────────┐ private  ┌──────────────────────────┐           ┌───────────────────────────┐
│ Postgres     │ network  │ backup service           │  HTTPS    │ pull.sh (cron / launchd)  │
│              │────────▶ │ pg_dump ─pipe─▶ age -r   │ ◀──────── │ Bearer <BACKUP_TOKEN>     │
└──────────────┘          │ (public key only)        │ ciphertext│ daily/ + monthly/ *.age   │
                          └──────────────────────────┘ ────────▶ └───────────────────────────┘
                                                                  private key: offline, never here
```

- **Backup service** (`scripts/backup/server.ts`, image `deploy/backup/Dockerfile`, config `deploy/backup/railway.json`): a separate Railway service. `GET /backup` runs `pg_dump --format=custom` and pipes it straight into `age`, encrypted to your public key(s). The plaintext dump never touches disk and never leaves Railway's private network; only ciphertext goes out. The service holds **no private key** and **no credentials to your storage**: your machine pulls, Railway never pushes.
- **Auth and rate limits**: `/backup` needs `Authorization: Bearer <BACKUP_TOKEN>`, a dedicated secret (at least 32 characters, used for nothing else, compared in constant time). It allows one dump per 10 minutes (`BACKUP_MIN_INTERVAL_SECONDS`) and one at a time, and after 10 failed authentications in an hour it answers `429` to everyone for the rest of that hour. The limits are in memory, so the service must run as **one replica** (as configured).
- **Pull script** (`scripts/backup/pull.sh`): runs nightly on your machine, downloads the ciphertext, checks its SHA-256 and that it is an age file, and stores it. It never decrypts, so your private key does not need to be on that machine.
- **Retention**: `daily/finance-YYYY-MM-DD.dump.age` keeps the newest 14; `monthly/finance-YYYY-MM.dump.age` (the first pull of each month) keeps the newest 12. Dates are UTC. Change with `KEEP_DAILY` / `KEEP_MONTHLY`.
- **Restore script** (`scripts/backup/restore.sh`): decrypts and pipes into `pg_restore` in a single transaction, into an empty database only.

The dump is taken when the pull asks for it, so "nightly" means "whenever your machine runs the pull". If the machine is off, no backup is taken that night; launchd catches up after sleep, and `last-success` (below) tells you when the last one landed.

## Checklist: what only you can do

Work through these once. Tick them in the issue (#6) as you go.

**Key custody**

- [ ] On a trusted computer (not the pull machine, not Railway), generate the key pair: `age-keygen -o finance-backup.key`. It prints `Public key: age1...`.
- [ ] Optionally protect the key file with a passphrase: `age -p -o finance-backup.key.age finance-backup.key`, then securely delete `finance-backup.key`. `age` (1.1+) and `restore.sh` accept the passphrase-protected file as `--identity` and prompt for the passphrase.
- [ ] Store the private key in at least two places you control (for example your password manager and a printed copy in a safe). Without it, every backup is useless.
- [ ] Optional: generate a second, escrow key (for example held by a trusted person) and use both public keys as recipients. Either key can then decrypt.
- [ ] Never put the private key on Railway, in the repo, or in the pull machine's backup folder.

**Railway (backup service)**

- [ ] In the Railway project, add a new service from this GitHub repository and name it `backup`.
- [ ] In the service's settings, set the config file path to `deploy/backup/railway.json` (it builds `deploy/backup/Dockerfile` and health-checks `/health`).
- [ ] Set the service variables:
  - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (the private URL, so the plaintext dump stays on Railway's private network; do not use `DATABASE_PUBLIC_URL`).
  - `BACKUP_TOKEN` = a fresh secret, for example from `openssl rand -hex 32`. Store it in your password manager as well.
  - `BACKUP_AGE_RECIPIENTS` = your public key(s), `age1...`, comma separated.
  - `PG_MAJOR` = the Postgres major version of the Railway database (run `SELECT version();` on it). The default is 16. The client must be the same major version or newer.
- [ ] Generate a public domain for the `backup` service. Note the URL.
- [ ] Check it: `curl https://<backup-domain>/health` returns `{"status":"ok"}`; `curl -i https://<backup-domain>/backup` without the token returns `401`.

**The pull machine**

Pick a machine that is on (or wakes) every night: a home server, a NAS that can run bash, or a Mac that sleeps but is used daily. It needs bash, curl and `sha256sum` or `shasum` (all standard on Linux and macOS). Put the backup folder on a disk that is itself backed up (Time Machine, NAS snapshots or similar) for a second copy.

- [ ] Copy `scripts/backup/pull.sh` to the machine, for example to `~/finance-backup/pull.sh`.
- [ ] Create `~/.config/finance-backup/pull.env` and run `chmod 600` on it:
  ```
  BACKUP_URL=https://<backup-domain>/backup
  BACKUP_TOKEN=<the BACKUP_TOKEN value>
  BACKUP_DIR=/path/to/finance-backups
  KEEP_DAILY=14
  KEEP_MONTHLY=12
  ```
  The file is read as plain `KEY=VALUE` lines, never executed. Lines starting with `#` are comments.
- [ ] Run it once by hand: `bash ~/finance-backup/pull.sh`. It prints `stored .../daily/finance-<date>.dump.age`. Running it again within 10 minutes gets a `429` (rate limit), which is expected.
- [ ] Schedule it:
  - **Linux (cron)**: `crontab -e`, add `17 3 * * * /bin/bash $HOME/finance-backup/pull.sh >> $HOME/finance-backup/pull.log 2>&1`. If cron can send mail on the machine, failures arrive by mail because the script exits non-zero.
  - **macOS (launchd)**: edit `deploy/backup/finance-backup-pull.plist` (replace `YOUR_USER`), copy it to `~/Library/LaunchAgents/`, then `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/finance-backup-pull.plist`. launchd runs a missed job when the Mac wakes. Grant `bash` Full Disk Access if `BACKUP_DIR` is in a protected folder.
- [ ] Set up a staleness check: `$BACKUP_DIR/last-success` holds the UTC time of the last good pull. Check it weekly, or add a monitor that alerts when it is older than 48 hours.

**Restore drills**

- [ ] Within the first week: do the local restore below with a real backup and your real key.
- [ ] Production restore test: restore the latest backup into a **new, separate** Railway Postgres service (or a local one), point a temporary app deployment at it, and check it as in step 4 below. Then delete the temporary services. Repeat every few months and after major schema changes.

## Restore

You need: the backup file (`*.dump.age`), the private key (or its passphrase-protected file), `age`, and the PostgreSQL 16 client tools (`psql`, `pg_restore`; macOS: `brew install age libpq`).

1. **Pick the backup.** Usually the newest file in `daily/`. To recover from an older mistake, pick an older daily or monthly file.
2. **Create an empty database.** Locally: `createdb finance_restore`. On Railway: add a new Postgres service, and use its `DATABASE_PUBLIC_URL` from your machine. Do not restore over the live database; `restore.sh` refuses any database that already has tables.
3. **Decrypt and restore** (the plaintext is streamed, never written to disk):
   ```sh
   scripts/backup/restore.sh \
     --identity /path/to/finance-backup.key \
     --target postgresql://postgres:postgres@localhost:5432/finance_restore \
     daily/finance-2026-10-30.dump.age
   ```
   It prints the number of tables and a row count per table. On a wrong key it says "could not decrypt" and restores nothing. On any `pg_restore` error the single transaction rolls back and the database stays empty.
4. **Start the app against it and verify.**
   ```sh
   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance_restore
   pnpm db:migrate          # applies migrations newer than the backup; "No migrations to run" if none
   pnpm build && pnpm start -p 3100
   curl http://localhost:3100/api/health     # {"status":"ok"}
   ```
   Open `http://localhost:3100` and check that the data you expect is there (Banks, Accounts, the latest Transactions). Compare the row counts printed in step 3 with what you expect from production.
5. **Switch over (real disaster only).** In Railway, point the app's `DATABASE_URL` (and the backup service's) at the restored database, redeploy, and check `/api/health`. Keep the broken database until you are sure nothing else is needed from it.

## Rotation

- **Backup secret**: set a new `BACKUP_TOKEN` on Railway, then update `pull.env`. Rotate it if the pull machine or the config file may have leaked.
- **Age key**: generate a new pair, put the new public key in `BACKUP_AGE_RECIPIENTS`. Keep the old private key as long as you keep backups encrypted with it (up to 12 months with the default retention).

## Tests and the agent walk-through

`scripts/backup/backup.test.ts` (part of `pnpm test`, needs `age` and the PostgreSQL client) generates a throwaway key pair per run and checks:

- `/backup` refuses a missing or wrong secret, enforces the dump interval and the failed-auth lockout, and refuses to start with a short secret or without a valid public key;
- the served artifact starts with the age header, contains neither the `PGDMP` magic nor row data, fails to decrypt with another key, and decrypts to a `pg_dump` archive with the right key;
- `pull.sh` stores daily and monthly copies, prunes to 14 and 12, keeps nothing on a `401`, and refuses plain http to a remote host;
- `restore.sh` restores a pulled backup into a fresh database with identical data (read through the service layer) that accepts new writes, refuses a non-empty target, and fails cleanly with the wrong key.

On 2026-10-30 the restore section above was walked through end to end against a local PostgreSQL 16: the backup service ran as the container runs it (`node --experimental-strip-types server.ts`, no install), `pull.sh` stored the daily and monthly copies, a second pull got `429`, `pg_restore --list` could not read the stored file, `restore.sh` restored it into a fresh database, `pnpm db:migrate` reported nothing to run, and `pnpm start` against it served `/api/health` as ok and listed the Bank created before the backup. The Docker image build itself was not run (no Docker daemon in that environment); it is checked when Railway first builds the service.

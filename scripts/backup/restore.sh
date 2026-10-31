#!/usr/bin/env bash
# Decrypts an encrypted backup and restores it into an EMPTY Postgres database.
#
#   restore.sh --identity <age-key-file> --target <postgres-url> <finance-YYYY-MM-DD.dump.age>
#
# The decrypted dump is streamed from `age` into `pg_restore` and never written to disk.
# The restore runs in one transaction: on any error the target is left empty.
# Needs age, psql and pg_restore. pg_restore must be the target server's major version (or
# older, down to the dump's): a newer one emits settings the server rejects.
# See docs/runbooks/backup-and-restore.md.
set -euo pipefail

fail() {
  echo "restore.sh: $*" >&2
  exit 1
}

usage() {
  fail "usage: restore.sh --identity <age-key-file> --target <postgres-url> <backup.dump.age>"
}

identity='' target='' backup=''
while [ $# -gt 0 ]; do
  case "$1" in
    --identity) identity="${2:-}"; shift 2 || usage ;;
    --target) target="${2:-}"; shift 2 || usage ;;
    -*) usage ;;
    *) backup="$1"; shift ;;
  esac
done
[ -n "$identity" ] && [ -n "$target" ] && [ -n "$backup" ] || usage
[ -r "$identity" ] || fail "cannot read identity file $identity"
[ -r "$backup" ] || fail "cannot read backup file $backup"

table_count() {
  psql "$target" --no-psqlrc --tuples-only --no-align --quiet --command \
    "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"
}

existing="$(table_count)" || fail "cannot connect to the target database"
[ "$existing" = "0" ] || fail "target database is not empty ($existing tables); restore into a fresh one"

# pg_restore 17+ emits `SET transaction_timeout`, which older servers reject, so a client newer
# than the server fails mid-restore. Check up front instead.
client_major="$(pg_restore --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
server_num="$(psql "$target" --no-psqlrc --tuples-only --no-align --quiet --command 'SHOW server_version_num')"
server_major=$((server_num / 10000))
[ "$client_major" -le "$server_major" ] ||
  fail "pg_restore $client_major is newer than the target server ($server_major); use the PostgreSQL $server_major client tools (macOS: brew install postgresql@$server_major, then put \"\$(brew --prefix postgresql@$server_major)/bin\" first on PATH)"

errors="$(mktemp)"
trap 'rm -f "$errors"' EXIT
set +e
age --decrypt --identity "$identity" "$backup" 2>"$errors" |
  pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
    --dbname "$target" 2>>"$errors"
statuses=("${PIPESTATUS[@]}")
set -e
if [ "${statuses[0]}" -ne 0 ]; then
  cat "$errors" >&2
  fail "could not decrypt $backup with $identity (wrong key or corrupted file); nothing restored"
fi
if [ "${statuses[1]}" -ne 0 ]; then
  cat "$errors" >&2
  fail "pg_restore failed; the transaction was rolled back and the target is unchanged"
fi

echo "restore.sh: restored $backup ($(table_count) tables)"
# ANALYZE refreshes planner statistics (pg_restore does not) and makes the row counts exact.
psql "$target" --no-psqlrc --quiet --command "ANALYZE" --command \
  "SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY relname"

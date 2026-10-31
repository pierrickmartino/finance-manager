#!/usr/bin/env bash
# Pulls the nightly encrypted backup onto the owner's machine and rotates old copies.
#
#   pull.sh [config-file]      (default: ~/.config/finance-backup/pull.env)
#
# Runs from cron (Linux) or launchd (macOS); see docs/runbooks/backup-and-restore.md.
# Needs only bash (3.2+), curl, and sha256sum or shasum. It never decrypts anything, so the
# private key does not have to live on this machine.
#
# Config file (chmod 600, KEY=VALUE lines, not executed):
#   BACKUP_URL=https://<backup-service>.up.railway.app/backup
#   BACKUP_TOKEN=<the dedicated backup secret>
#   BACKUP_DIR=/path/to/backups
#   KEEP_DAILY=14      (optional)
#   KEEP_MONTHLY=12    (optional)
#
# Layout: $BACKUP_DIR/daily/finance-YYYY-MM-DD.dump.age and
#         $BACKUP_DIR/monthly/finance-YYYY-MM.dump.age (first pull of each month, UTC dates).
# Exit status is non-zero on any failure, and nothing partial is kept.
set -euo pipefail

AGE_HEADER='age-encryption.org/v1'

fail() {
  echo "pull.sh: $*" >&2
  exit 1
}

config_file="${1:-$HOME/.config/finance-backup/pull.env}"
[ -r "$config_file" ] || fail "cannot read config file $config_file"

BACKUP_URL='' BACKUP_TOKEN='' BACKUP_DIR='' KEEP_DAILY=14 KEEP_MONTHLY=12
while IFS='=' read -r name value || [ -n "$name" ]; do
  case "$name" in
    BACKUP_URL) BACKUP_URL="$value" ;;
    BACKUP_TOKEN) BACKUP_TOKEN="$value" ;;
    BACKUP_DIR) BACKUP_DIR="$value" ;;
    KEEP_DAILY) KEEP_DAILY="$value" ;;
    KEEP_MONTHLY) KEEP_MONTHLY="$value" ;;
    '' | '#'*) ;;
    *) fail "unknown setting '$name' in $config_file" ;;
  esac
done <"$config_file"

[ -n "$BACKUP_URL" ] || fail "BACKUP_URL is not set"
[ -n "$BACKUP_TOKEN" ] || fail "BACKUP_TOKEN is not set"
[ -n "$BACKUP_DIR" ] || fail "BACKUP_DIR is not set"
case "$KEEP_DAILY$KEEP_MONTHLY" in *[!0-9]*) fail "KEEP_DAILY and KEEP_MONTHLY must be numbers" ;; esac
case "$BACKUP_URL" in
  https://*) ;;
  http://localhost[:/]* | http://127.0.0.1[:/]*) ;; # local testing only
  *) fail "BACKUP_URL must use https" ;;
esac

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"
umask 077
incoming="$(mktemp "$BACKUP_DIR/.incoming.XXXXXX")"
headers="$(mktemp "$BACKUP_DIR/.headers.XXXXXX")"
trap 'rm -f "$incoming" "$headers"' EXIT

# The secret goes to curl on stdin, so it never shows up in the process list.
printf 'header = "Authorization: Bearer %s"\n' "$BACKUP_TOKEN" |
  curl --config - --silent --show-error --fail --max-time 1800 \
    --dump-header "$headers" --output "$incoming" "$BACKUP_URL" ||
  fail "download from $BACKUP_URL failed"

expected="$(tr -d '\r' <"$headers" | awk -F': ' 'tolower($1) == "x-backup-sha256" { print $2 }')"
[ -n "$expected" ] || fail "response has no X-Backup-SHA256 header"
[ "$(sha256 "$incoming")" = "$expected" ] || fail "checksum mismatch, download corrupted"
[ "$(head -c ${#AGE_HEADER} "$incoming")" = "$AGE_HEADER" ] ||
  fail "download is not an age-encrypted file; refusing to store it"

today="$(date -u +%Y-%m-%d)"
month="${today%-*}"
daily="$BACKUP_DIR/daily/finance-$today.dump.age"
mv -f "$incoming" "$daily"
monthly="$BACKUP_DIR/monthly/finance-$month.dump.age"
[ -e "$monthly" ] || cp "$daily" "$monthly"

# Names sort chronologically, so the newest N are the last N.
prune() {
  ls -1 "$1" | grep -E '^finance-[0-9-]+\.dump\.age$' | sort -r | tail -n "+$(($2 + 1))" |
    while read -r old; do rm -f "$1/$old"; done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"

date -u +%Y-%m-%dT%H:%M:%SZ >"$BACKUP_DIR/last-success"
echo "pull.sh: stored $daily ($(wc -c <"$daily" | tr -d ' ') bytes)"

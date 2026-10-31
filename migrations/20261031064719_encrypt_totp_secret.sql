-- Up Migration
-- The TOTP secret is encrypted at rest (AES-256-GCM, key from TOTP_ENCRYPTION_KEY), as the
-- spec schema says. SQL has no key, so existing rows keep their plaintext value under the new
-- name: the app encrypts it on the next successful login, and `pnpm auth:reset` replaces it.
-- See README, "Signing in".
ALTER TABLE auth_credential RENAME COLUMN totp_secret TO totp_secret_enc;

-- The last TOTP time step accepted (Unix time / 30 s). A code at or before it is refused, so a
-- code works once, even within its drift window.
ALTER TABLE auth_credential ADD COLUMN totp_last_step bigint;

-- Down Migration
-- Encrypted values stay encrypted: after rolling back, run `pnpm auth:reset` on the old code.
ALTER TABLE auth_credential DROP COLUMN totp_last_step;
ALTER TABLE auth_credential RENAME COLUMN totp_secret_enc TO totp_secret;

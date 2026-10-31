-- Up Migration
-- The single user's credentials. One row (id is always true); its existence means first-run
-- setup is complete, which disables the setup screen for good. A CLI reset updates it in place.
CREATE TABLE auth_credential (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  password_hash text NOT NULL,
  totp_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Single-use recovery codes, stored as SHA-256 hashes (the codes are high-entropy random).
CREATE TABLE auth_recovery_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  used_at timestamptz,
  CONSTRAINT auth_recovery_code_hash_unique UNIQUE (code_hash)
);

-- Login sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE auth_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  CONSTRAINT auth_session_token_hash_unique UNIQUE (token_hash)
);

-- Login attempts, for rate limiting.
CREATE TABLE auth_login_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at timestamptz NOT NULL,
  succeeded boolean NOT NULL
);

CREATE INDEX auth_login_attempt_attempted_at_idx ON auth_login_attempt (attempted_at);

-- Down Migration
DROP TABLE auth_login_attempt;
DROP TABLE auth_session;
DROP TABLE auth_recovery_code;
DROP TABLE auth_credential;

-- Up Migration
CREATE TABLE account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES bank (id) ON DELETE RESTRICT,
  name text NOT NULL,
  kind text NOT NULL CONSTRAINT account_kind_check
    CHECK (kind IN ('current', 'savings', '3a', 'loan')),
  currency char(3) NOT NULL CONSTRAINT account_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  -- Normalised: no spaces, upper case. NULL when the Account has none (e.g. a loan).
  iban text,
  -- NULL: no Import format (Manual transactions only). Fixed once the Account has
  -- Transactions (ADR-0003); the service layer enforces that.
  import_format text CONSTRAINT account_import_format_check
    CHECK (import_format IN ('camt053', 'ubs_csv', 'ofx')),
  -- Integer minor units of the Account's Currency (ADR-0002).
  opening_balance_minor bigint NOT NULL DEFAULT 0,
  opening_date date,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX account_iban_unique ON account (iban) WHERE iban IS NOT NULL;
CREATE UNIQUE INDEX account_name_unique ON account (bank_id, lower(name));

-- Down Migration
DROP TABLE account;

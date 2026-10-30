-- Up Migration

-- A Statement balance entered by hand: the Account's balance at the end of `date`, in minor
-- units of the Account's Currency. At most one per Account and day.
CREATE TABLE balance_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
  date date NOT NULL,
  balance_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balance_snapshot_account_date_unique UNIQUE (account_id, date)
);

-- Down Migration
DROP TABLE balance_snapshot;

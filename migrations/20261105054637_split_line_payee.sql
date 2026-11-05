-- Up Migration

-- A Split line can name its own Payee (ADR-0006). A line without one reports under its
-- Transaction's Payee: the line's reported Payee is `coalesce(sl.payee_id, t.payee_id)`. A
-- Payee still named by a line can't be deleted. A Transfer line has no Payee: its other side is
-- one of the user's own Accounts.
ALTER TABLE split_line
  ADD COLUMN payee_id uuid REFERENCES payee (id) ON DELETE RESTRICT,
  ADD CONSTRAINT split_line_transfer_has_no_payee
    CHECK (payee_id IS NULL OR transfer_id IS NULL);

CREATE INDEX split_line_payee_id ON split_line (payee_id) WHERE payee_id IS NOT NULL;

-- Down Migration
DROP INDEX split_line_payee_id;
ALTER TABLE split_line
  DROP CONSTRAINT split_line_transfer_has_no_payee,
  DROP COLUMN payee_id;

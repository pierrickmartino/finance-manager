-- Up Migration

-- A Recurring payment the user dismissed as a false positive (ADR-0011). Recurring payments are
-- never stored, so a dismissal is anchored on the charges its series held when dismissed: a
-- recognised series is dismissed if it contains any of them.
CREATE TABLE recurring_payment_dismissal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One charge a dismissal is anchored on: exactly one of a whole Transaction or a Split line.
-- Deleting the Transaction, or replacing the Split line, drops the reference.
CREATE TABLE recurring_payment_dismissal_charge (
  dismissal_id uuid NOT NULL REFERENCES recurring_payment_dismissal (id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES "transaction" (id) ON DELETE CASCADE,
  split_line_id uuid REFERENCES split_line (id) ON DELETE CASCADE,
  CONSTRAINT recurring_payment_dismissal_charge_one_kind
    CHECK (num_nonnulls(transaction_id, split_line_id) = 1)
);

CREATE UNIQUE INDEX recurring_payment_dismissal_charge_transaction
  ON recurring_payment_dismissal_charge (dismissal_id, transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX recurring_payment_dismissal_charge_split_line
  ON recurring_payment_dismissal_charge (dismissal_id, split_line_id)
  WHERE split_line_id IS NOT NULL;
CREATE INDEX recurring_payment_dismissal_charge_by_transaction
  ON recurring_payment_dismissal_charge (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX recurring_payment_dismissal_charge_by_split_line
  ON recurring_payment_dismissal_charge (split_line_id) WHERE split_line_id IS NOT NULL;

-- A dismissal left with no charges anchors nothing, so it goes too. This also runs for the
-- references FK cascades drop when a Transaction is deleted or a Split line replaced.
CREATE FUNCTION delete_empty_recurring_payment_dismissals() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM recurring_payment_dismissal d
  WHERE d.id IN (SELECT DISTINCT dismissal_id FROM dropped_rows)
    AND NOT EXISTS (
      SELECT 1 FROM recurring_payment_dismissal_charge c WHERE c.dismissal_id = d.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER recurring_payment_dismissal_charge_delete AFTER DELETE
  ON recurring_payment_dismissal_charge
  REFERENCING OLD TABLE AS dropped_rows
  FOR EACH STATEMENT EXECUTE FUNCTION delete_empty_recurring_payment_dismissals();

-- Down Migration
DROP TRIGGER recurring_payment_dismissal_charge_delete ON recurring_payment_dismissal_charge;
DROP FUNCTION delete_empty_recurring_payment_dismissals();
DROP TABLE recurring_payment_dismissal_charge;
DROP TABLE recurring_payment_dismissal;

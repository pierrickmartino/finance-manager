-- Up Migration

-- A previewed Import that is not committed or discarded yet. It holds the parsed statement,
-- not domain data, so it writes no History. Committing or discarding it deletes the row.
CREATE TABLE import_preview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  statement jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_preview_created_at ON import_preview (created_at);

-- One committed upload of one bank file into one Account.
CREATE TABLE import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  import_format text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  statement_from date,
  statement_to date,
  -- Statement balances as the file states them, in minor units. NULL when the file has none.
  opening_balance_minor bigint,
  closing_balance_minor bigint,
  added_count integer NOT NULL,
  duplicate_count integer NOT NULL,
  reconciliation_status text NOT NULL CONSTRAINT import_reconciliation_status_check
    CHECK (reconciliation_status IN ('ok', 'mismatch')),
  -- The reconciliation detail shown in the preview (differences, running-balance breaks).
  reconciliation jsonb NOT NULL,
  undone_at timestamptz
);

CREATE INDEX import_account ON import (account_id, imported_at DESC);

-- One movement of money on one Account (ADR-0001), in the Account's Currency (ADR-0002).
CREATE TABLE "transaction" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
  import_id uuid REFERENCES import (id) ON DELETE RESTRICT,
  is_manual boolean NOT NULL,
  booking_date date NOT NULL,
  value_date date,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  -- ADR-0003: the bank reference, or a hash with an occurrence index. NULL for Manual ones.
  fingerprint text,
  bank_reference text,
  raw_description text NOT NULL DEFAULT '',
  counterparty_name text,
  counterparty_iban text,
  payment_reference text,
  bundled_details jsonb,
  notes text,
  locked_fields text[] NOT NULL DEFAULT '{}',
  -- Insertion order: keeps same-day Transactions in the bank's order.
  entry_order bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_imported_check
    CHECK (is_manual OR (import_id IS NOT NULL AND fingerprint IS NOT NULL))
);

CREATE UNIQUE INDEX transaction_fingerprint_unique ON "transaction" (account_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
CREATE INDEX transaction_account_date ON "transaction" (account_id, booking_date);
CREATE INDEX transaction_import ON "transaction" (import_id) WHERE import_id IS NOT NULL;

-- Bank fields of an imported Transaction are immutable (spec, domain rules).
CREATE FUNCTION transaction_bank_fields_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT OLD.is_manual AND (
       NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.import_id IS DISTINCT FROM OLD.import_id
    OR NEW.is_manual IS DISTINCT FROM OLD.is_manual
    OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
    OR NEW.value_date IS DISTINCT FROM OLD.value_date
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
    OR NEW.bank_reference IS DISTINCT FROM OLD.bank_reference
    OR NEW.raw_description IS DISTINCT FROM OLD.raw_description
    OR NEW.counterparty_name IS DISTINCT FROM OLD.counterparty_name
    OR NEW.counterparty_iban IS DISTINCT FROM OLD.counterparty_iban
    OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
    OR NEW.bundled_details IS DISTINCT FROM OLD.bundled_details
  ) THEN
    RAISE EXCEPTION 'The bank fields of an imported Transaction cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'transaction_bank_fields_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transaction_bank_fields_immutable
  BEFORE UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION transaction_bank_fields_immutable();

-- Down Migration
DROP TABLE "transaction";
DROP FUNCTION transaction_bank_fields_immutable();
DROP TABLE import;
DROP TABLE import_preview;

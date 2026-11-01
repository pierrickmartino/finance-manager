-- Up Migration

-- Split lines (ADR-0004): a Split divides one Transaction's classification, not the
-- Transaction. Each line carries a signed amount in minor units of the Transaction's Currency
-- (ADR-0002), a required Category, Tags and a note. A Transaction is split exactly when it has
-- Split lines; its own Category is then null. Lines go with their Transaction.
CREATE TABLE split_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES "transaction" (id) ON DELETE CASCADE,
  position integer NOT NULL,
  amount_minor bigint NOT NULL,
  category_id uuid NOT NULL REFERENCES category (id) ON DELETE RESTRICT,
  note text,
  CONSTRAINT split_line_position_unique UNIQUE (transaction_id, position)
);

CREATE INDEX split_line_category ON split_line (category_id);

-- Tags on a Split line, mirroring transaction_tag (always added by hand: Rules never split).
CREATE TABLE split_line_tag (
  split_line_id uuid NOT NULL REFERENCES split_line (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag (id) ON DELETE RESTRICT,
  PRIMARY KEY (split_line_id, tag_id)
);

CREATE INDEX split_line_tag_tag ON split_line_tag (tag_id);

-- Backstop for the service's checks: a split Transaction has at least two lines summing
-- exactly to its amount, and no Category or Transfer of its own. The service writes a whole
-- set of lines in one INSERT, so the check runs per statement.
CREATE FUNCTION refuse_invalid_splits(transaction_ids uuid[]) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "transaction" t
    JOIN (SELECT transaction_id, count(*) AS n, sum(amount_minor) AS total
          FROM split_line WHERE transaction_id = ANY(transaction_ids)
          GROUP BY transaction_id) s ON s.transaction_id = t.id
    WHERE s.n < 2 OR s.total <> t.amount_minor
       OR t.category_id IS NOT NULL OR t.transfer_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A Split must have at least two lines summing to its Transaction, which has no Category or Transfer'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'split_line_invariants';
  END IF;
END;
$$;

CREATE FUNCTION split_line_rows_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refuse_invalid_splits(ARRAY(SELECT DISTINCT transaction_id FROM changed_rows));
  RETURN NULL;
END;
$$;

CREATE TRIGGER split_line_insert_check AFTER INSERT ON split_line
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION split_line_rows_check();
CREATE TRIGGER split_line_update_check AFTER UPDATE ON split_line
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION split_line_rows_check();
CREATE TRIGGER split_line_delete_check AFTER DELETE ON split_line
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION split_line_rows_check();

CREATE FUNCTION transaction_split_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refuse_invalid_splits(ARRAY(
    SELECT n.id FROM changed_rows n WHERE EXISTS (
      SELECT 1 FROM split_line sl WHERE sl.transaction_id = n.id)));
  RETURN NULL;
END;
$$;

CREATE TRIGGER transaction_split_check AFTER UPDATE ON "transaction"
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION transaction_split_check();

-- Down Migration
DROP TRIGGER transaction_split_check ON "transaction";
DROP FUNCTION transaction_split_check();
DROP TRIGGER split_line_delete_check ON split_line;
DROP TRIGGER split_line_update_check ON split_line;
DROP TRIGGER split_line_insert_check ON split_line;
DROP FUNCTION split_line_rows_check();
DROP FUNCTION refuse_invalid_splits(uuid[]);
DROP TABLE split_line_tag;
DROP TABLE split_line;

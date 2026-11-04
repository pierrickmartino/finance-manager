-- Up Migration

-- Editing a Split updates its lines in place, matched by id, so that a line keeps its identity
-- (a Transfer side, ADR-0005). The service rewrites a whole Split in one statement, which may
-- move lines between positions: uniqueness is checked at the end of that statement.
ALTER TABLE split_line
  DROP CONSTRAINT split_line_position_unique,
  ADD CONSTRAINT split_line_position_unique UNIQUE (transaction_id, position)
    DEFERRABLE INITIALLY IMMEDIATE;

-- Down Migration
ALTER TABLE split_line
  DROP CONSTRAINT split_line_position_unique,
  ADD CONSTRAINT split_line_position_unique UNIQUE (transaction_id, position);

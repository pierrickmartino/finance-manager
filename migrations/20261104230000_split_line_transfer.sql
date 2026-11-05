-- Up Migration

-- A Split line can be a side of a Transfer (ADR-0005), held by `split_line.transfer_id` as a
-- whole Transaction's is by `transaction.transfer_id`. A line then has no Category: it has a
-- Category or a Transfer, never both. It may have neither once its Transfer is unlinked, and its
-- Transaction is then Unclassified. The Transfers service checks the two-sides,
-- different-Accounts and opposite-signs rules across both tables.
ALTER TABLE split_line
  ALTER COLUMN category_id DROP NOT NULL,
  ADD COLUMN transfer_id uuid REFERENCES transfer (id) ON DELETE SET NULL,
  ADD CONSTRAINT split_line_category_or_transfer
    CHECK (category_id IS NULL OR transfer_id IS NULL);

CREATE INDEX split_line_transfer_id ON split_line (transfer_id) WHERE transfer_id IS NOT NULL;

-- Down Migration
DROP INDEX split_line_transfer_id;
ALTER TABLE split_line
  DROP CONSTRAINT split_line_category_or_transfer,
  DROP COLUMN transfer_id,
  ALTER COLUMN category_id SET NOT NULL;

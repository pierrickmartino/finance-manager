-- Up Migration

-- The opening balance change an Import made when its proposed opening balance was accepted:
-- {"before": {"amountMinor", "date"}, "after": {"amountMinor", "date"}}. NULL when it made none.
-- Undoing the Import restores "before" when no Transaction is left on the Account.
ALTER TABLE import ADD COLUMN opening_change jsonb;

-- Down Migration
ALTER TABLE import DROP COLUMN opening_change;

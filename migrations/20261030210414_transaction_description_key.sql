-- Up Migration

-- The Unclassified view groups Transactions by their normalised raw description (spec 61):
-- lower case, unaccented, whitespace collapsed and trimmed.
ALTER TABLE "transaction" ADD COLUMN description_key text NOT NULL GENERATED ALWAYS AS (
  pg_catalog.btrim(public.normalize_search_text(raw_description))
) STORED;

-- Grouping and expanding the Unclassified groups (Transactions with no Category).
CREATE INDEX transaction_unclassified_description ON "transaction" (description_key)
  WHERE category_id IS NULL;

-- Down Migration

DROP INDEX transaction_unclassified_description;
ALTER TABLE "transaction" DROP COLUMN description_key;

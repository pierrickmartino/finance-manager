-- Up Migration

-- Free-text search over Transactions (spec story 67): case- and accent-insensitive, with
-- whitespace collapsed, across raw description, counterparty name and payment reference.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Lower case, accents stripped, whitespace collapsed. IMMUTABLE so a generated column and an
-- index can use it; every name is schema-qualified so a restore (empty search_path) works.
CREATE FUNCTION normalize_search_text(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN pg_catalog.lower(pg_catalog.regexp_replace(
  public.unaccent('public.unaccent'::regdictionary, input), '\s+', ' ', 'g'));

-- The searchable text of a Transaction. The fields are joined with U+001F (unit separator),
-- so a search term never matches across two fields.
ALTER TABLE "transaction" ADD COLUMN search_text text NOT NULL GENERATED ALWAYS AS (
  public.normalize_search_text(
    raw_description || chr(31) || coalesce(counterparty_name, '') || chr(31)
      || coalesce(payment_reference, ''))
) STORED;

-- Substring search (LIKE '%term%') through trigrams.
CREATE INDEX transaction_search_text ON "transaction" USING gin (search_text gin_trgm_ops);

-- The list's sort order (newest first), for the unfiltered list and date ranges.
CREATE INDEX transaction_list_order ON "transaction" (booking_date DESC, entry_order DESC);

-- Down Migration
DROP INDEX transaction_list_order;
DROP INDEX transaction_search_text;
ALTER TABLE "transaction" DROP COLUMN search_text;
DROP FUNCTION normalize_search_text(text);
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS unaccent;

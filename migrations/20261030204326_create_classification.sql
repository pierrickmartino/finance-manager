-- Up Migration

-- Two-level classification (spec 49-59). The starter set is seeded in code on first run
-- (src/server/services/categories/seed.ts), never here: tests truncate every table.
CREATE TABLE category_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CONSTRAINT category_group_type_check
    CHECK (type IN ('income', 'expense', 'capital')),
  sort integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX category_group_name_unique ON category_group (lower(name));

CREATE TABLE category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES category_group (id) ON DELETE RESTRICT,
  name text NOT NULL,
  sort integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX category_name_unique ON category (group_id, lower(name));
CREATE INDEX category_group_sort ON category (group_id, sort);

CREATE TABLE payee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE UNIQUE INDEX payee_name_unique ON payee (lower(name));

CREATE TABLE tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE UNIQUE INDEX tag_name_unique ON tag (lower(name));

-- Tags on a Transaction. `source` says who added it: a manual edit or a Rule.
CREATE TABLE transaction_tag (
  transaction_id uuid NOT NULL REFERENCES "transaction" (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag (id) ON DELETE RESTRICT,
  source text NOT NULL CONSTRAINT transaction_tag_source_check
    CHECK (source IN ('manual', 'rule')),
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX transaction_tag_tag ON transaction_tag (tag_id);

ALTER TABLE "transaction"
  ADD COLUMN payee_id uuid REFERENCES payee (id) ON DELETE RESTRICT,
  ADD COLUMN category_id uuid REFERENCES category (id) ON DELETE RESTRICT;

CREATE INDEX transaction_payee ON "transaction" (payee_id) WHERE payee_id IS NOT NULL;
CREATE INDEX transaction_category ON "transaction" (category_id) WHERE category_id IS NOT NULL;

-- Defaults created once by code on first run (starter Categories, later the starter
-- Dashboard). A row means "already seeded": deleting the seeded data never re-seeds it.
CREATE TABLE first_run_seed (
  name text PRIMARY KEY,
  seeded_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE first_run_seed;
DROP INDEX transaction_category;
DROP INDEX transaction_payee;
ALTER TABLE "transaction" DROP COLUMN category_id, DROP COLUMN payee_id;
DROP TABLE transaction_tag;
DROP TABLE tag;
DROP TABLE payee;
DROP TABLE category;
DROP TABLE category_group;

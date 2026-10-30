-- Up Migration
CREATE TABLE bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bank_name_unique ON bank (lower(name));

-- Down Migration
DROP TABLE bank;

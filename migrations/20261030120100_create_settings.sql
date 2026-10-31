-- Up Migration
-- A single row (id is always true). No row means the Swiss defaults apply.
CREATE TABLE settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  number_format text NOT NULL,
  date_format text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE settings;

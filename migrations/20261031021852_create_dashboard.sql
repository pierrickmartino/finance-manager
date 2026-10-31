-- Up Migration
-- A Dashboard: a named, ordered grid of Widgets (spec 104). `sort` orders the Dashboards.
CREATE TABLE dashboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CONSTRAINT dashboard_name_check CHECK (length(btrim(name)) > 0),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A Widget sits on at most one Dashboard (NULL: a standalone Widget from the Reports page).
-- Deleting a Dashboard deletes its Widgets (the service deletes them first, to record History).
ALTER TABLE widget
  ADD COLUMN dashboard_id uuid CONSTRAINT widget_dashboard_fk REFERENCES dashboard (id) ON DELETE CASCADE,
  -- What the Widget shows: its Widget query, or the Account balances in CHF (not a flow query).
  ADD COLUMN source text NOT NULL DEFAULT 'query' CONSTRAINT widget_source_check
    CHECK (source IN ('query', 'account_balances'));

CREATE INDEX widget_dashboard ON widget (dashboard_id);

-- Down Migration
DROP INDEX widget_dashboard;
ALTER TABLE widget DROP COLUMN source, DROP COLUMN dashboard_id;
DROP TABLE dashboard;

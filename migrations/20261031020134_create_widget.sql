-- Up Migration
-- A Widget: a saved Widget query (filters, date range, axes, measure) and how it is shown.
-- Standalone for now; the Dashboards ticket adds `dashboard_id` and the `dashboard` table.
CREATE TABLE widget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CONSTRAINT widget_name_check CHECK (length(btrim(name)) > 0),
  -- The Widget query definition, as validated by the reporting engine (`widgetQueryInput`).
  query jsonb NOT NULL,
  visualisation text NOT NULL DEFAULT 'table' CONSTRAINT widget_visualisation_check
    CHECK (visualisation IN ('table', 'line', 'stacked_bar', 'donut', 'number')),
  -- Position and size on a Dashboard grid; NULL until the Widget is placed.
  layout jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE widget;

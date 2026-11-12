-- Up Migration

-- A Dashboard is a free grid of sized cards (ADR-0010): a Widget's layout is read literally as
-- its place and size on a 12-column board. Every Dashboard moves from Story order (x 0, y the
-- index; a layout left from the former grid is read by y, then x) onto the grid: in that order,
-- three across (w 4 at x 0, 4 and 8), at the default height for each Widget's chapter kind,
-- each row starting below the tallest card of the row above. The heights are those of
-- `WIDGET_SIZES` in src/lib/reporting/board.ts. A stacked bar's kind depends on how many series
-- its data has, which SQL can't tell: it gets a chart's height, which meets either minimum.
WITH ordered AS (
  SELECT
    id,
    dashboard_id,
    (row_number() OVER (
      PARTITION BY dashboard_id
      ORDER BY (layout->>'y')::int NULLS LAST, (layout->>'x')::int NULLS LAST, created_at, id
    ) - 1)::int AS n,
    CASE
      WHEN visualisation = 'number' THEN 3
      WHEN source = 'account_balances' THEN 6
      WHEN visualisation IN ('table', 'donut') THEN 8
      ELSE 6
    END AS h
  FROM widget
  WHERE dashboard_id IS NOT NULL
),
grid_rows AS (
  SELECT dashboard_id, n / 3 AS r, max(h) AS row_height
  FROM ordered
  GROUP BY dashboard_id, n / 3
),
row_tops AS (
  SELECT
    dashboard_id,
    r,
    coalesce(sum(row_height) OVER (
      PARTITION BY dashboard_id ORDER BY r ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0)::int AS y
  FROM grid_rows
)
UPDATE widget w
SET layout = jsonb_build_object('x', (o.n % 3) * 4, 'y', t.y, 'w', 4, 'h', o.h)
FROM ordered o
JOIN row_tops t ON t.dashboard_id = o.dashboard_id AND t.r = o.n / 3
WHERE w.id = o.id;

-- Down Migration

-- Back to Story order (ADR-0007): the nth Widget in reading order at y n, x 0, its size kept.
WITH ordered AS (
  SELECT
    id,
    (row_number() OVER (
      PARTITION BY dashboard_id
      ORDER BY (layout->>'y')::int NULLS LAST, (layout->>'x')::int NULLS LAST, created_at, id
    ) - 1)::int AS n
  FROM widget
  WHERE dashboard_id IS NOT NULL AND layout IS NOT NULL
)
UPDATE widget w
SET layout = jsonb_build_object('x', 0, 'y', o.n, 'w', (w.layout->>'w')::int, 'h', (w.layout->>'h')::int)
FROM ordered o
WHERE w.id = o.id;

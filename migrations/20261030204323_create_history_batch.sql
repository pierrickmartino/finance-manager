-- Up Migration

-- A one-line, readable summary of a Batch ("Merged Payee Coop Pronto into Coop, 12
-- Transactions"). Optional: most Batches have none. Written by `history.summarize(...)` inside
-- the same transaction as the Batch's entries.
CREATE TABLE history_batch (
  id uuid PRIMARY KEY,
  summary text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE history_batch;

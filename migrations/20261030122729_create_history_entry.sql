-- Up Migration
-- Append-only: one row per changed field. Written by the History recorder inside the
-- transaction of the change it describes (see src/server/services/history).
CREATE TABLE history_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Insertion order, so entries of one Batch read back in the order they were recorded.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  batch_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CONSTRAINT history_entry_actor_type_check
    CHECK (actor_type IN ('manual', 'rule', 'import', 'system')),
  actor_id text,
  entity_type text NOT NULL,
  -- text, not uuid: some entities (settings) have no uuid.
  entity_id text NOT NULL,
  field text NOT NULL,
  before jsonb,
  after jsonb
);

CREATE UNIQUE INDEX history_entry_seq_unique ON history_entry (seq);
CREATE INDEX history_entry_batch_idx ON history_entry (batch_id);
CREATE INDEX history_entry_entity_idx ON history_entry (entity_type, entity_id);
CREATE INDEX history_entry_at_idx ON history_entry (at);

CREATE FUNCTION history_entry_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history_entry is append-only (% refused)', TG_OP;
END;
$$;

CREATE TRIGGER history_entry_append_only
  BEFORE UPDATE OR DELETE ON history_entry
  FOR EACH ROW EXECUTE FUNCTION history_entry_append_only();

-- Down Migration
DROP TABLE history_entry;
DROP FUNCTION history_entry_append_only();

-- Up Migration

-- What the notifications bell listed when it was last opened (ADR-0019): one row per Attention
-- item, by its identity (kind and subject), with its form, the kind's measure of "got worse".
-- Replaced wholesale each time the bell is opened. The app is single-user, so there is no user
-- key, and this is not domain data, so it writes no History entries.
CREATE TABLE attention_seen (
  kind text NOT NULL,
  -- The Account or Recurring payment the item is about; '' when it is about no one subject.
  subject text NOT NULL,
  form jsonb NOT NULL,
  PRIMARY KEY (kind, subject)
);

-- Down Migration
DROP TABLE attention_seen;

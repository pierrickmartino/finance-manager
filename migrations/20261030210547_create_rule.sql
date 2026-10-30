-- Up Migration

-- Classification Rules (spec 69-82). `conditions` and `actions` are validated by the service
-- (src/server/services/rules); their shapes are the evaluator's RuleCondition[] and RuleActions.
-- Payee, Category and Tag ids inside `actions` are kept in step by the merge and delete
-- operations of those entities (src/server/services/rules/references.ts).
CREATE TABLE rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  conditions jsonb NOT NULL,
  actions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rule_sort ON rule (sort, created_at);

-- Down Migration
DROP TABLE rule;

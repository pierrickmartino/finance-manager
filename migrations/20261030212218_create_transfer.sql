-- Up Migration

-- Two Transactions on different Accounts, with opposite signs, linked as money moving between
-- the user's own Accounts (ADR-0001). The pair is held by `transaction.transfer_id`; the
-- Transfers service checks the two-sides, different-Accounts and opposite-signs rules.
CREATE TABLE transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "transaction"
  ADD COLUMN transfer_id uuid REFERENCES transfer (id) ON DELETE SET NULL;

CREATE INDEX transaction_transfer_id ON "transaction" (transfer_id) WHERE transfer_id IS NOT NULL;

-- Down Migration
DROP INDEX transaction_transfer_id;
ALTER TABLE "transaction" DROP COLUMN transfer_id;
DROP TABLE transfer;

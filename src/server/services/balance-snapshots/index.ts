import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { mutate, type ServiceContext } from '../context';
import { ConflictError, isUniqueViolation, NotFoundError, parseInput } from '../errors';
import type { HistorySnapshot } from '../history';

/** A Statement balance entered by hand: the balance at the end of `date`. Minor units. */
export interface BalanceSnapshot {
  id: string;
  accountId: string;
  date: string;
  balanceMinor: number;
}

/** A Balance snapshot compared with the balance the app computes at its date. */
export interface SnapshotCheck extends BalanceSnapshot {
  /**
   * Opening balance plus every Transaction booked on or before the date. Null on an Account
   * with no Transactions: it is tracked through snapshots only, so there is nothing to check.
   */
  computedMinor: number | null;
  /** computed − snapshot: positive when the app holds more than the bank says. */
  differenceMinor: number | null;
  isMismatch: boolean;
}

export interface BalanceSnapshotInput {
  date: string;
  balanceMinor: number;
}

export interface RecordBalanceSnapshotInput extends BalanceSnapshotInput {
  accountId: string;
}

const snapshotFields = {
  date: z.iso.date({ error: 'Date must be a date (YYYY-MM-DD)' }),
  balanceMinor: z
    .number({ error: 'Balance is required' })
    .int('Balance must be in minor units')
    .refine((value) => Number.isSafeInteger(value), 'Balance is too large'),
};
const snapshotInput = z.object(snapshotFields);
const recordSnapshotInput = z.object({
  accountId: z.uuid({ error: 'Account is required' }),
  ...snapshotFields,
});

const SNAPSHOT_NOT_FOUND = 'Balance snapshot not found';
const snapshotId = z.uuid();

const SNAPSHOT_COLUMNS = `s.id, s.account_id AS "accountId", s.date, s.balance_minor AS "balanceMinor"`;

// The computed balance at the end of the snapshot's date; null when the Account has no
// Transactions at all (a snapshot-only Account).
const SELECT_CHECK = `
  SELECT ${SNAPSHOT_COLUMNS}, c."computedMinor",
         c."computedMinor" - s.balance_minor AS "differenceMinor",
         COALESCE(c."computedMinor" <> s.balance_minor, false) AS "isMismatch"
  FROM balance_snapshot s
  JOIN account a ON a.id = s.account_id
  LEFT JOIN LATERAL (
    SELECT a.opening_balance_minor + COALESCE(sum(t.amount_minor) FILTER (
             WHERE t.booking_date <= s.date), 0)::bigint AS "computedMinor"
    FROM "transaction" t
    WHERE t.account_id = a.id
    HAVING count(*) > 0
  ) c ON true`;

function snapshot(value: BalanceSnapshot): HistorySnapshot {
  return { accountId: value.accountId, date: value.date, balanceMinor: value.balanceMinor };
}

async function findSnapshot(db: Queryable, id: string, lock = false): Promise<BalanceSnapshot> {
  if (!snapshotId.safeParse(id).success) throw new NotFoundError(SNAPSHOT_NOT_FOUND);
  const result = await db.query<BalanceSnapshot>(
    `SELECT ${SNAPSHOT_COLUMNS} FROM balance_snapshot s WHERE s.id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  const found = result.rows[0];
  if (!found) throw new NotFoundError(SNAPSHOT_NOT_FOUND);
  return found;
}

async function requireAccount(db: Queryable, accountId: string): Promise<void> {
  const result = await db.query('SELECT 1 FROM account WHERE id = $1', [accountId]);
  if (result.rowCount === 0) throw new NotFoundError('Account not found');
}

async function withDateCheck<T>(date: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'balance_snapshot_account_date_unique')) {
      throw new ConflictError(`This Account already has a Balance snapshot on ${date}`);
    }
    throw error;
  }
}

/** Records the Account's balance at the end of a day, as the bank states it. */
export async function recordBalanceSnapshot(
  ctx: ServiceContext,
  input: RecordBalanceSnapshotInput,
): Promise<BalanceSnapshot> {
  const values = parseInput(recordSnapshotInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    await requireAccount(tx, values.accountId);
    const inserted = await withDateCheck(values.date, () =>
      tx.query<{ id: string }>(
        `INSERT INTO balance_snapshot (account_id, date, balance_minor)
         VALUES ($1, $2, $3) RETURNING id`,
        [values.accountId, values.date, values.balanceMinor],
      ),
    );
    const created = await findSnapshot(tx, inserted.rows[0]!.id);
    await history.record('balance_snapshot', created.id, null, snapshot(created));
    return created;
  });
}

export async function updateBalanceSnapshot(
  ctx: ServiceContext,
  id: string,
  input: BalanceSnapshotInput,
): Promise<BalanceSnapshot> {
  const values = parseInput(snapshotInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findSnapshot(tx, id, true);
    await withDateCheck(values.date, () =>
      tx.query('UPDATE balance_snapshot SET date = $1, balance_minor = $2 WHERE id = $3', [
        values.date,
        values.balanceMinor,
        id,
      ]),
    );
    const after = await findSnapshot(tx, id);
    await history.record('balance_snapshot', id, snapshot(before), snapshot(after));
    return after;
  });
}

export async function deleteBalanceSnapshot(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }) => {
    const before = await findSnapshot(tx, id, true);
    await tx.query('DELETE FROM balance_snapshot WHERE id = $1', [id]);
    await history.record('balance_snapshot', id, snapshot(before), null);
  });
}

/** An Account's Balance snapshots, newest first, each checked against the computed balance. */
export async function listBalanceSnapshots(
  ctx: ServiceContext,
  accountId: string,
): Promise<SnapshotCheck[]> {
  if (!z.uuid().safeParse(accountId).success) return [];
  const result = await ctx.db.query<SnapshotCheck>(
    `${SELECT_CHECK} WHERE s.account_id = $1 ORDER BY s.date DESC`,
    [accountId],
  );
  return result.rows;
}

/** Every Balance snapshot that disagrees with its Account's computed balance, newest first. */
export async function listSnapshotMismatches(ctx: ServiceContext): Promise<SnapshotCheck[]> {
  const result = await ctx.db.query<SnapshotCheck>(
    `SELECT * FROM (${SELECT_CHECK}) checks WHERE "isMismatch"
     ORDER BY "accountId", date DESC`,
  );
  return result.rows;
}

import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import type { MutationScope } from '../context';
import { ConflictError, isUniqueViolation, NotFoundError } from '../errors';

export interface Payee {
  id: string;
  name: string;
  /** How many Transactions have this Payee, themselves or on a Split line (ADR-0006). */
  transactionCount: number;
}

/** A Payee by id and name, as a classification or a picker refers to it. */
export type PayeeRef = Pick<Payee, 'id' | 'name'>;

const MAX_NAME_LENGTH = 100;

export const payeeName = z
  .string()
  .trim()
  .min(1, 'Payee name is required')
  .max(MAX_NAME_LENGTH, `Payee name must be at most ${MAX_NAME_LENGTH} characters`);

/**
 * SQL: the ids of the Transactions using a Payee, directly or via a Split line (ADR-0006), each
 * once. `payeeMatch` completes `payee_id <payeeMatch>`, e.g. `= $1` or `IS NOT NULL`.
 */
export function transactionsUsingPayeeSql(payeeMatch: string): string {
  return `SELECT t.id FROM "transaction" t WHERE t.payee_id ${payeeMatch}
          UNION
          SELECT sl.transaction_id FROM split_line sl WHERE sl.payee_id ${payeeMatch}`;
}

export const SELECT_PAYEE = `
  SELECT p.id, p.name,
         (SELECT count(*)::int FROM (${transactionsUsingPayeeSql('= p.id')}) used)
           AS "transactionCount"
  FROM payee p`;

export async function findPayee(db: Queryable, id: string, lock = false): Promise<Payee> {
  const notFound = new NotFoundError('Payee not found');
  if (!z.uuid().safeParse(id).success) throw notFound;
  const result = await db.query<Payee>(
    `${SELECT_PAYEE} WHERE p.id = $1${lock ? ' FOR UPDATE OF p' : ''}`,
    [id],
  );
  const payee = result.rows[0];
  if (!payee) throw notFound;
  return payee;
}

/** Maps the name uniqueness violation to a user message. */
export async function uniquePayeeName<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'payee_name_unique')) {
      throw new ConflictError(`A Payee named "${name}" already exists`);
    }
    throw error;
  }
}

/** Inserts a Payee inside an open mutation, recording it. */
export async function insertPayee({ tx, history }: MutationScope, name: string): Promise<Payee> {
  const inserted = await uniquePayeeName(name, () =>
    tx.query<{ id: string }>('INSERT INTO payee (name) VALUES ($1) RETURNING id', [name]),
  );
  const payee = await findPayee(tx, inserted.rows[0]!.id);
  await history.record('payee', payee.id, null, { name: payee.name });
  return payee;
}

/** The Payee with this name (ignoring case), created when there is none. */
export async function findOrCreatePayee(scope: MutationScope, name: string): Promise<Payee> {
  const existing = await scope.tx.query<Payee>(`${SELECT_PAYEE} WHERE lower(p.name) = lower($1)`, [
    name,
  ]);
  return existing.rows[0] ?? insertPayee(scope, name);
}

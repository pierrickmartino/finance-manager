import { z } from 'zod';
import type { ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import { filterConditions, transactionQueryInput, type TransactionQuery } from './query';

/** Where a Transaction sits in a Transactions list, for stepping through it (ADR-0013). */
export interface TransactionPlace {
  /** Whether the Transaction matches the list's filters now. */
  matches: boolean;
  /** Its 1-based position in the list; null when it doesn't match. */
  position: number | null;
  /** Transactions matching the filters. */
  total: number;
  /** The matching Transaction just before it in the list's order (newer); null on the first. */
  previousId: string | null;
  /** The matching Transaction just after it (older); null on the last. */
  nextId: string | null;
  /** The list page (at the query's page size) it sits on, or would sit on if it matched. */
  page: number;
}

const transactionId = z.uuid();

/**
 * Locates a Transaction in the Transactions list of `query` (its page is ignored). The list's
 * order (booking date, then entry order, newest first) is a total order, so neighbours are
 * found by comparing on that key: a Transaction that doesn't match still has its place.
 */
export async function locateTransaction(
  ctx: ServiceContext,
  query: TransactionQuery,
  id: string,
): Promise<TransactionPlace> {
  const notFound = new NotFoundError('Transaction not found');
  if (!transactionId.safeParse(id).success) throw notFound;
  const input = parseInput(transactionQueryInput, { ...query, page: 1 });
  const where = filterConditions(input);
  const target = `$${where.params.length + 1}::uuid`;
  const matching = (extra: string): string =>
    `FROM "transaction" t ${where.sql ? `${where.sql} AND` : 'WHERE'} ${extra}`;
  const key = '(t.booking_date, t.entry_order)';
  const targetKey = '(x.booking_date, x.entry_order)';

  const result = await ctx.db.query<{
    total: number;
    newer: number;
    matches: boolean;
    previousId: string | null;
    nextId: string | null;
  }>(
    `SELECT
       (SELECT count(*)::int ${matching('TRUE')}) AS total,
       (SELECT count(*)::int ${matching(`${key} > ${targetKey}`)}) AS newer,
       EXISTS (SELECT 1 ${matching(`t.id = x.id`)}) AS matches,
       (SELECT t.id ${matching(`${key} > ${targetKey}`)}
          ORDER BY t.booking_date, t.entry_order LIMIT 1) AS "previousId",
       (SELECT t.id ${matching(`${key} < ${targetKey}`)}
          ORDER BY t.booking_date DESC, t.entry_order DESC LIMIT 1) AS "nextId"
     FROM "transaction" x WHERE x.id = ${target}`,
    [...where.params, id],
  );
  const row = result.rows[0];
  if (!row) throw notFound;
  return {
    matches: row.matches,
    position: row.matches ? row.newer + 1 : null,
    total: row.total,
    previousId: row.previousId,
    nextId: row.nextId,
    page: Math.floor(row.newer / input.pageSize) + 1,
  };
}

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
  /** The list page (at `pageSize`) it sits on, or would sit on if it matched. */
  page: number;
  /** Transactions per list page: the query's page size. */
  pageSize: number;
}

const transactionId = z.uuid();

/*
 * In the query below, `located` is the Transaction being located and `t` a Transaction of the
 * list (the alias the list's filters are written against). The list's order, newest first, is
 * this key descending: entry order is unique, so it is a total order.
 */
const LIST_KEY = '(t.booking_date, t.entry_order)';
const LOCATED_KEY = '(located.booking_date, located.entry_order)';
const NEWER_THAN_LOCATED = `${LIST_KEY} > ${LOCATED_KEY}`;
const OLDER_THAN_LOCATED = `${LIST_KEY} < ${LOCATED_KEY}`;

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
  const filters = filterConditions(input);
  const locatedId = `$${filters.params.length + 1}::uuid`;
  /** The list's Transactions that also meet `condition`. */
  const listRowsWhere = (condition: string): string =>
    `FROM "transaction" t ${filters.sql ? `${filters.sql} AND` : 'WHERE'} ${condition}`;

  const result = await ctx.db.query<{
    total: number;
    newerCount: number;
    matches: boolean;
    previousId: string | null;
    nextId: string | null;
  }>(
    `SELECT
       (SELECT count(*)::int ${listRowsWhere('TRUE')}) AS total,
       (SELECT count(*)::int ${listRowsWhere(NEWER_THAN_LOCATED)}) AS "newerCount",
       EXISTS (SELECT 1 ${listRowsWhere('t.id = located.id')}) AS matches,
       (SELECT t.id ${listRowsWhere(NEWER_THAN_LOCATED)}
          ORDER BY t.booking_date, t.entry_order LIMIT 1) AS "previousId",
       (SELECT t.id ${listRowsWhere(OLDER_THAN_LOCATED)}
          ORDER BY t.booking_date DESC, t.entry_order DESC LIMIT 1) AS "nextId"
     FROM "transaction" located WHERE located.id = ${locatedId}`,
    [...filters.params, id],
  );
  const row = result.rows[0];
  if (!row) throw notFound;
  return {
    matches: row.matches,
    position: row.matches ? row.newerCount + 1 : null,
    total: row.total,
    previousId: row.previousId,
    nextId: row.nextId,
    page: Math.floor(row.newerCount / input.pageSize) + 1,
    pageSize: input.pageSize,
  };
}

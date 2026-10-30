import { z } from 'zod';
import type { ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import { SELECT_TRANSACTION, type Transaction } from './model';
import { filterConditions, transactionQueryInput, type TransactionQuery } from './query';

export type { Transaction } from './model';
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type TransactionQuery } from './query';

/** A Transaction as the list shows it: with the name of its Account. */
export interface TransactionListItem extends Transaction {
  accountName: string;
}

export interface TransactionPage {
  transactions: TransactionListItem[];
  /** Transactions matching the filters, across all pages. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** A Transaction with what its detail view shows around it. */
export interface TransactionDetail extends TransactionListItem {
  /** The Import that brought it in; null for a Manual transaction. */
  import: { id: string; fileName: string; importedAt: Date } | null;
}

const FROM_LIST = `FROM "transaction" t JOIN account a ON a.id = t.account_id`;

/** SELECT_TRANSACTION plus the Account name and any extra columns and joins. */
function selectTransactions(extraColumns = '', extraJoins = ''): string {
  return SELECT_TRANSACTION.replace(
    'FROM "transaction" t',
    `, a.name AS "accountName" ${extraColumns} ${FROM_LIST} ${extraJoins}`,
  );
}

/** Transactions matching every filter, newest booking date first, one page at a time. */
export async function listTransactions(
  ctx: ServiceContext,
  query: TransactionQuery = {},
): Promise<TransactionPage> {
  const input = parseInput(transactionQueryInput, query);
  const { page, pageSize } = input;
  const where = filterConditions(input);
  const limit = where.params.length + 1;
  const [count, rows] = await Promise.all([
    ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total ${FROM_LIST} ${where.sql}`,
      where.params,
    ),
    ctx.db.query<TransactionListItem>(
      `${selectTransactions()} ${where.sql}
       ORDER BY t.booking_date DESC, t.entry_order DESC
       LIMIT $${limit} OFFSET $${limit + 1}`,
      [...where.params, pageSize, (page - 1) * pageSize],
    ),
  ]);
  const total = count.rows[0]?.total ?? 0;
  return {
    transactions: rows.rows,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

const transactionId = z.uuid();

/** One Transaction with its Account name and source Import. */
export async function getTransaction(ctx: ServiceContext, id: string): Promise<TransactionDetail> {
  const notFound = new NotFoundError('Transaction not found');
  if (!transactionId.safeParse(id).success) throw notFound;
  const result = await ctx.db.query<TransactionDetail>(
    `${selectTransactions(
      `, CASE WHEN i.id IS NULL THEN NULL ELSE json_build_object(
           'id', i.id, 'fileName', i.file_name, 'importedAt', i.imported_at) END AS "import"`,
      'LEFT JOIN import i ON i.id = t.import_id',
    )}
     WHERE t.id = $1`,
    [id],
  );
  const transaction = result.rows[0];
  if (!transaction) throw notFound;
  const { import: source } = transaction;
  return {
    ...transaction,
    import: source && { ...source, importedAt: new Date(source.importedAt) },
  };
}

import { z } from 'zod';
import type { ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import { loadClassifications, type Classification } from './classification';
import { SELECT_TRANSACTION, type Transaction } from './model';
import { filterConditions, transactionQueryInput, type TransactionQuery } from './query';

export type { Transaction } from './model';
export {
  CLASSIFICATION_FIELD_LABELS,
  CLASSIFICATION_FIELDS,
  editClassification,
  getClassification,
  unlockFields,
  type Classification,
  type ClassificationChanges,
  type ClassificationField,
  type SplitLine,
} from './classification';
export { removeSplit, splitTransaction, type SplitLineInput } from './split';
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type TransactionQuery } from './query';

/** A Transaction as the list shows it: with the name of its Account and its classification. */
export interface TransactionListItem extends Transaction {
  accountName: string;
  payee: Classification['payee'];
  category: Classification['category'];
  tags: Classification['tags'];
  /** Its Split lines in their order; empty when it is not split (then `category` holds it). */
  splitLines: Classification['splitLines'];
  /**
   * When the list is filtered by a Category and the Transaction is split: the summed amount of
   * its Split lines in that Category, the part of it that belongs there. Null otherwise.
   */
  matchingSplitAmountMinor: number | null;
}

type ClassificationKey = 'payee' | 'category' | 'tags' | 'splitLines' | 'matchingSplitAmountMinor';
type TransactionRow = Omit<TransactionListItem, ClassificationKey>;

/** The summed amount of the Split lines in the Category; null when none is in it. */
function matchingSplitAmount(
  splitLines: Classification['splitLines'],
  categoryId: string | undefined,
): number | null {
  const matching = splitLines.filter((line) => line.category.id === categoryId);
  if (matching.length === 0) return null;
  return matching.reduce((sum, line) => sum + line.amountMinor, 0);
}

/**
 * Adds the Payee, Category, Tags and Split lines to rows read with SELECT_TRANSACTION, and the
 * amount of the Split lines in `categoryId` (the Category filter) when given.
 */
async function withClassification<T extends TransactionRow>(
  ctx: ServiceContext,
  rows: T[],
  categoryId?: string,
): Promise<(T & Pick<TransactionListItem, ClassificationKey>)[]> {
  const classifications = new Map(
    (
      await loadClassifications(
        ctx.db,
        rows.map((row) => row.id),
      )
    ).map((c) => [c.transactionId, c]),
  );
  return rows.map((row) => {
    const classification = classifications.get(row.id);
    const splitLines = classification?.splitLines ?? [];
    return {
      ...row,
      payee: classification?.payee ?? null,
      category: classification?.category ?? null,
      tags: classification?.tags ?? [],
      splitLines,
      matchingSplitAmountMinor: matchingSplitAmount(splitLines, categoryId),
    };
  });
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
function transactionListSql(extraColumns = '', extraJoins = ''): string {
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
    ctx.db.query<TransactionRow>(
      `${transactionListSql()} ${where.sql}
       ORDER BY t.booking_date DESC, t.entry_order DESC
       LIMIT $${limit} OFFSET $${limit + 1}`,
      [...where.params, pageSize, (page - 1) * pageSize],
    ),
  ]);
  const total = count.rows[0]?.total ?? 0;
  return {
    transactions: await withClassification(ctx, rows.rows, input.categoryId),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

/** The list items of the given Transactions, in the order of `ids` (unknown ids are skipped). */
export async function listTransactionsByIds(
  ctx: ServiceContext,
  ids: readonly string[],
): Promise<TransactionListItem[]> {
  if (ids.length === 0) return [];
  const rows = await ctx.db.query<TransactionRow>(
    `${transactionListSql()} WHERE t.id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.rows.map((row) => [row.id, row]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  return withClassification(ctx, ordered);
}

const transactionId = z.uuid();

/** One Transaction with its Account name and source Import. */
export async function getTransaction(ctx: ServiceContext, id: string): Promise<TransactionDetail> {
  const notFound = new NotFoundError('Transaction not found');
  if (!transactionId.safeParse(id).success) throw notFound;
  const result = await ctx.db.query<Omit<TransactionDetail, ClassificationKey>>(
    `${transactionListSql(
      `, CASE WHEN i.id IS NULL THEN NULL ELSE json_build_object(
           'id', i.id, 'fileName', i.file_name, 'importedAt', i.imported_at) END AS "import"`,
      'LEFT JOIN import i ON i.id = t.import_id',
    )}
     WHERE t.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw notFound;
  const [transaction] = await withClassification(ctx, [row]);
  const { import: source } = transaction!;
  return {
    ...transaction!,
    import: source && { ...source, importedAt: new Date(source.importedAt) },
  };
}

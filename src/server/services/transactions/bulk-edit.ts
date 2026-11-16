import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { categoryLabel } from '@/lib/classification';
import { findCategory } from '../categories/model';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import { findOrCreatePayee, findPayee, payeeName } from '../payees/model';
import { findOrCreateTags, findTag, tagName, type Tag } from '../tags/model';
import { CLASSIFICATION_FIELDS, recordClassificationChanges } from './classification';
import {
  filterConditions,
  transactionQueryInput,
  UNCLASSIFIED_CONDITION,
  type TransactionQuery,
} from './query';
import { IS_SPLIT } from './split-guard';

/**
 * Bulk edit (spec 62, 64): sets the Payee, Category or Tags of many Transactions at once, as one
 * user action. The given fields are written and locked on every selected Transaction, as a
 * manual edit (`applyClassification` with `by: 'manual'`) would. Tags are never replaced: the
 * given ones are added or removed, and the others stay. The whole edit is one History Batch with
 * a summary, with one entry per changed field of each Transaction.
 *
 * It only sets values (no clearing a Payee or Category). A Category change leaves out split
 * Transactions and whole-Transaction Transfer sides (#147): they are neither written nor locked
 * for Category, while the edit's other changes still apply to them.
 *
 * The writes are set-based (one UPDATE for all Transactions) rather than one
 * `applyClassification` per Transaction: that is ~20 round trips per Transaction, and 2 000
 * Transactions took 15 s. Set-based, they take 1.3 s (see `bulk-edit.perf.test.ts`).
 */

/**
 * Most Transactions one Bulk edit takes, whatever its scope (ids, a group or a filter): one
 * click can't change a whole history by accident. A larger scope is refused before any write.
 */
export const MAX_BULK_EDIT = 10_000;

/** A count as the limit messages show it, e.g. "12,400". */
const formatCount = (count: number): string => count.toLocaleString('en-US');

const LIMIT = formatCount(MAX_BULK_EDIT);
const TOO_MANY_IDS = `Select at most ${LIMIT} Transactions per edit`;

/** A Bulk edit only sets values: clearing a Category or Payee stays a per-Transaction edit. */
const ONLY_SETS = 'A Bulk edit only sets values: it cannot clear a Payee or Category';

/** Tells a clearing attempt (null) why it is refused; other errors keep `otherwise`. */
const refuseClearing =
  (otherwise?: string) =>
  (issue: { input?: unknown }): string | undefined =>
    issue.input === null ? ONLY_SETS : otherwise;

const settableId = z.uuid({ error: refuseClearing('Unknown id') });

const bulkChanges = z
  .object({
    payeeId: settableId.optional(),
    payeeName: z.string({ error: refuseClearing() }).pipe(payeeName).optional(),
    categoryId: settableId.optional(),
    addTagIds: z
      .array(z.uuid({ error: 'Unknown Tag' }))
      .min(1, 'Choose a Tag to add')
      .optional(),
    addTagNames: z.array(tagName).min(1, 'Choose a Tag to add').optional(),
    removeTagIds: z
      .array(z.uuid({ error: 'Unknown Tag' }))
      .min(1, 'Choose a Tag to remove')
      .optional(),
  })
  .strict()
  .refine((input) => input.payeeId === undefined || input.payeeName === undefined, {
    message: 'Give the Payee by id or by name, not both',
  })
  .refine((input) => input.addTagIds === undefined || input.addTagNames === undefined, {
    message: 'Give the Tags to add by id or by name, not both',
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Choose a Payee, Category or Tags to set',
  });

const bulkEditInput = z.object({
  /** Transactions picked one by one. */
  transactionIds: z
    .array(z.uuid({ error: 'Transaction not found' }))
    .max(MAX_BULK_EDIT, TOO_MANY_IDS)
    .optional(),
  /** A whole Unclassified group: every member still Unclassified when the edit runs. */
  groupKey: z.string().optional(),
  /**
   * Every Transaction the Transactions list's filter matches, across all its pages (#149).
   * Its page and page size, if given, are ignored.
   */
  filter: transactionQueryInput.optional(),
  changes: bulkChanges,
});

/** A Transactions list filter as a Bulk edit scope: the list's query without its page. */
export type BulkFilter = Omit<TransactionQuery, 'page' | 'pageSize'>;

export type BulkEditInput = z.input<typeof bulkEditInput>;
/** Payee, Category and Tags only: notes stay a per-Transaction field. */
export type BulkChanges = z.input<typeof bulkChanges>;

export interface BulkEditResult {
  batchId: string;
  /** Transactions the edit changed. */
  count: number;
  /** Split and Transfer Transactions left out of a Category change (0 without one). */
  leftOut: number;
}

/**
 * The ids of the Transactions `from` (a `FROM "transaction" t ... WHERE ...` clause) selects,
 * locked so they can't change under the edit. More than MAX_BULK_EDIT is refused with
 * `tooMany(count)`, without locking or counting beyond what that needs.
 */
async function lockedMatches(
  { tx }: MutationScope,
  from: { sql: string; params: unknown[] },
  tooMany: (count: string) => string,
): Promise<string[]> {
  const matches = await tx.query<{ id: string }>(
    `SELECT t.id ${from.sql}
     ORDER BY t.booking_date, t.entry_order
     LIMIT ${MAX_BULK_EDIT + 1}
     FOR UPDATE OF t`,
    from.params,
  );
  if (matches.rows.length > MAX_BULK_EDIT) {
    const count = await tx.query<{ total: number }>(
      `SELECT count(*)::int AS total ${from.sql}`,
      from.params,
    );
    throw new ValidationError(tooMany(formatCount(count.rows[0]?.total ?? 0)));
  }
  return matches.rows.map((match) => match.id);
}

/**
 * The selected Transaction ids, without repeats: the ones given, plus the members of the chosen
 * Unclassified group, plus the filter's matches. The filter uses the list's own conditions, so
 * it selects exactly the Transactions the list shows for it, on every page. A split member
 * (Unclassified while a line has neither a Category nor a Transfer, ADR-0005) stays selected:
 * the Category change leaves it out (`leftOutOfCategory`), the other changes still apply.
 */
async function resolveSelectedIds(
  scope: MutationScope,
  input: z.output<typeof bulkEditInput>,
): Promise<string[]> {
  const ids = [...(input.transactionIds ?? [])];
  if (input.groupKey !== undefined) {
    const group = {
      sql: `FROM "transaction" t WHERE t.description_key = $1 AND ${UNCLASSIFIED_CONDITION}`,
      params: [input.groupKey],
    };
    const tooMany = (count: string) =>
      `This group has ${count} Transactions, at most ${LIMIT} per edit`;
    ids.push(...(await lockedMatches(scope, group, tooMany)));
  }
  if (input.filter !== undefined) {
    const where = filterConditions(input.filter);
    const filter = { sql: `FROM "transaction" t ${where.sql}`, params: where.params };
    const tooMany = (count: string) =>
      `Narrow the filter: ${count} match, at most ${LIMIT} per edit`;
    ids.push(...(await lockedMatches(scope, filter, tooMany)));
  }
  const unique = [...new Set(ids)];
  if (unique.length > MAX_BULK_EDIT) throw new ValidationError(TOO_MANY_IDS);
  return unique;
}

/** Resolved values: absent = field untouched. */
interface BulkValues {
  payeeId?: string;
  categoryId?: string;
  /** Tags added where missing; the Transaction's other Tags stay. */
  addTagIds?: string[];
  /** Tags deleted; the Transaction's other Tags stay. */
  removeTagIds?: string[];
}

interface ResolvedChanges {
  changes: BulkValues;
  /** Readable parts of the Batch summary, e.g. "Payee Migros". */
  summary: string[];
}

/** Tags by name (creating missing ones) or by id, without repeats. */
async function resolveTags(
  scope: MutationScope,
  ids: readonly string[] | undefined,
  names: readonly string[] | undefined,
): Promise<Tag[]> {
  const tags = names
    ? await findOrCreateTags(scope, names)
    : await Promise.all((ids ?? []).map((id) => findTag(scope.tx, id)));
  return [...new Map(tags.map((tag) => [tag.id, tag])).values()];
}

/**
 * Turns names into ids once (creating missing Payees and Tags), and
 * describes the edit for the Batch summary.
 */
async function resolveChanges(
  scope: MutationScope,
  input: z.output<typeof bulkChanges>,
): Promise<ResolvedChanges> {
  const changes: BulkValues = {};
  const summary: string[] = [];

  const payee =
    input.payeeId !== undefined
      ? await findPayee(scope.tx, input.payeeId)
      : input.payeeName !== undefined
        ? await findOrCreatePayee(scope, input.payeeName)
        : undefined;
  if (payee) {
    changes.payeeId = payee.id;
    summary.push(`Payee ${payee.name}`);
  }
  if (input.categoryId !== undefined) {
    const category = await findCategory(scope.tx, input.categoryId);
    changes.categoryId = category.id;
    summary.push(`Category ${categoryLabel(category)}`);
  }
  if (input.addTagNames !== undefined || input.addTagIds !== undefined) {
    const tags = await resolveTags(scope, input.addTagIds, input.addTagNames);
    changes.addTagIds = tags.map((tag) => tag.id);
    summary.push(`Tags added ${tags.map((tag) => tag.name).join(', ')}`);
  }
  if (input.removeTagIds !== undefined) {
    const tags = await resolveTags(scope, input.removeTagIds, undefined);
    changes.removeTagIds = tags.map((tag) => tag.id);
    summary.push(`Tags removed ${tags.map((tag) => tag.name).join(', ')}`);
  }
  return { changes, summary };
}

/** Refuses the edit when a selected id doesn't exist, and locks the selected Transactions. */
async function lockSelected({ tx }: MutationScope, ids: readonly string[]): Promise<void> {
  const found = await tx.query(
    'SELECT id FROM "transaction" WHERE id = ANY($1::uuid[]) FOR UPDATE',
    [ids],
  );
  if (found.rowCount !== ids.length) throw new NotFoundError('Transaction not found');
}

/** The fields the edit writes, in CLASSIFICATION_FIELDS order. */
function editedFields(values: BulkValues): string[] {
  const touched: Record<string, boolean> = {
    payee: values.payeeId !== undefined,
    category: values.categoryId !== undefined,
    tags: values.addTagIds !== undefined || values.removeTagIds !== undefined,
  };
  return CLASSIFICATION_FIELDS.filter((field) => touched[field]);
}

/**
 * The ids among these that a Category change leaves out: split Transactions (their Split lines
 * hold the Categories, ADR-0004) and whole-Transaction Transfer sides (a Transfer has no
 * Category). One query.
 */
async function leftOutOfCategory(tx: Queryable, ids: readonly string[]): Promise<Set<string>> {
  const result = await tx.query<{ id: string }>(
    `SELECT t.id FROM "transaction" t
     WHERE t.id = ANY($1::uuid[]) AND (t.transfer_id IS NOT NULL OR ${IS_SPLIT})`,
    [ids],
  );
  return new Set(result.rows.map((row) => row.id));
}

/**
 * Writes and locks the given fields on every Transaction, in a few set-based statements. The
 * Category is written and locked only on `categoryIds`; the other fields on every Transaction.
 */
async function writeAll(
  { tx }: MutationScope,
  ids: string[],
  categoryIds: string[],
  values: BulkValues,
): Promise<void> {
  // Locks stay in CLASSIFICATION_FIELDS order: the current locks plus the edited fields.
  await tx.query(
    `UPDATE "transaction" t
     SET payee_id = CASE WHEN $2 THEN $3::uuid ELSE t.payee_id END,
         category_id = CASE WHEN t.id = ANY($4::uuid[]) THEN $5::uuid ELSE t.category_id END,
         locked_fields = ARRAY(
           SELECT f.name FROM unnest($6::text[]) WITH ORDINALITY AS f(name, n)
           WHERE f.name = ANY(t.locked_fields)
              OR (f.name = ANY($7::text[]) AND (f.name <> 'category' OR t.id = ANY($4::uuid[])))
           ORDER BY f.n)
     WHERE t.id = ANY($1::uuid[])`,
    [
      ids,
      values.payeeId !== undefined,
      values.payeeId ?? null,
      categoryIds,
      values.categoryId ?? null,
      CLASSIFICATION_FIELDS,
      editedFields(values),
    ],
  );
  await writeTags(tx, ids, values);
}

/**
 * Removes the given Tags and adds the given ones where missing, as manual Tags, keeping every
 * other Tag the Transactions have (from Rules too). Split-line Tags are never touched.
 */
async function writeTags(tx: Queryable, ids: string[], values: BulkValues): Promise<void> {
  if (values.removeTagIds !== undefined) {
    await tx.query(
      'DELETE FROM transaction_tag WHERE transaction_id = ANY($1::uuid[]) AND tag_id = ANY($2::uuid[])',
      [ids, values.removeTagIds],
    );
  }
  if (values.addTagIds === undefined) return;
  await tx.query(
    `INSERT INTO transaction_tag (transaction_id, tag_id, source)
     SELECT transaction_id, tag_id, 'manual'
     FROM unnest($1::uuid[]) AS transaction_id CROSS JOIN unnest($2::uuid[]) AS tag_id
     ON CONFLICT DO NOTHING`,
    [ids, values.addTagIds],
  );
}

/**
 * Sets the given Payee, Category and Tags on every selected Transaction and locks those fields
 * against the Rules. All or nothing: one failing Transaction rolls the whole edit back.
 */
export async function bulkEditClassification(
  ctx: ServiceContext,
  input: BulkEditInput,
): Promise<BulkEditResult> {
  const values = parseInput(bulkEditInput, input);
  return mutate(ctx, async (scope) => {
    const ids = await resolveSelectedIds(scope, values);
    if (ids.length === 0) throw new ValidationError('Select at least one Transaction');
    await lockSelected(scope, ids);
    const { changes, summary } = await resolveChanges(scope, values.changes);
    const leftOut =
      changes.categoryId === undefined ? new Set<string>() : await leftOutOfCategory(scope.tx, ids);
    const categoryIds =
      changes.categoryId === undefined ? [] : ids.filter((id) => !leftOut.has(id));
    await recordClassificationChanges(scope, ids, () => writeAll(scope, ids, categoryIds, changes));
    // A left-out Transaction is still changed when the edit sets anything besides the Category.
    const changesMore = editedFields(changes).some((field) => field !== 'category');
    const count = changesMore ? ids.length : categoryIds.length;
    const noun = count === 1 ? 'Transaction' : 'Transactions';
    const leftOutNote = leftOut.size > 0 ? ` (${leftOut.size} split or Transfer left out)` : '';
    await scope.history.summarize(
      `Bulk edit of ${count} ${noun}: ${summary.join(', ')}${leftOutNote}`,
    );
    return { batchId: scope.history.batchId, count, leftOut: leftOut.size };
  });
}

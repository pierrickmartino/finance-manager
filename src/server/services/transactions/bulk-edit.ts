import { z } from 'zod';
import { findCategory } from '../categories/model';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import { findOrCreatePayee, findPayee, payeeName } from '../payees/model';
import { findOrCreateTags, findTag, tagName } from '../tags/model';
import { CLASSIFICATION_FIELDS, recordClassificationChanges } from './classification';
import { UNCLASSIFIED_CONDITION } from './query';
import { anyInTransfer } from './transfer-guard';

/**
 * Bulk edit (spec 62, 64): sets the Payee, Category or Tags of many Transactions at once, as one
 * user action. The given fields are written and locked on every selected Transaction, as a
 * manual edit (`applyClassification` with `by: 'manual'`) would, and the given Tags replace the
 * current ones. The whole edit is one History Batch with a summary, with one entry per changed
 * field of each Transaction.
 *
 * The writes are set-based (one UPDATE for all Transactions) rather than one
 * `applyClassification` per Transaction: that is ~20 round trips per Transaction, and 2 000
 * Transactions took 15 s. Set-based, they take 1.3 s (see `bulk-edit.perf.test.ts`).
 */

/** Most Transactions one bulk edit takes by id (a whole group has no limit). */
export const MAX_BULK_IDS = 10_000;

const optionalId = z.uuid({ error: 'Unknown id' }).nullable().optional();

const bulkChanges = z
  .object({
    payeeId: optionalId,
    payeeName: payeeName.nullable().optional(),
    categoryId: optionalId,
    tagIds: z.array(z.uuid({ error: 'Unknown Tag' })).optional(),
    tagNames: z.array(tagName).optional(),
  })
  .strict()
  .refine((input) => input.payeeId === undefined || input.payeeName === undefined, {
    message: 'Give the Payee by id or by name, not both',
  })
  .refine((input) => input.tagIds === undefined || input.tagNames === undefined, {
    message: 'Give the Tags by id or by name, not both',
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Choose a Payee, Category or Tags to set',
  });

const bulkEditInput = z.object({
  /** Transactions picked one by one. */
  transactionIds: z
    .array(z.uuid({ error: 'Transaction not found' }))
    .max(MAX_BULK_IDS, `Select at most ${MAX_BULK_IDS} Transactions`)
    .optional(),
  /** A whole Unclassified group: every member still Unclassified when the edit runs. */
  groupKey: z.string().optional(),
  changes: bulkChanges,
});

export type BulkEditInput = z.input<typeof bulkEditInput>;
/** Payee, Category and Tags only: notes stay a per-Transaction field. */
export type BulkChanges = z.input<typeof bulkChanges>;

export interface BulkEditResult {
  batchId: string;
  /** Transactions the edit touched. */
  count: number;
}

/** The selected Transaction ids, without repeats, locked for the edit. */
async function selectTransactions(
  { tx }: MutationScope,
  input: z.output<typeof bulkEditInput>,
): Promise<string[]> {
  const ids = [...(input.transactionIds ?? [])];
  if (input.groupKey !== undefined) {
    const members = await tx.query<{ id: string }>(
      `SELECT t.id FROM "transaction" t
       WHERE t.description_key = $1 AND ${UNCLASSIFIED_CONDITION}
       ORDER BY t.booking_date, t.entry_order
       FOR UPDATE`,
      [input.groupKey],
    );
    ids.push(...members.rows.map((member) => member.id));
  }
  return [...new Set(ids)];
}

/** Resolved values: absent = field untouched, null = cleared. */
interface BulkValues {
  payeeId?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
}

interface ResolvedChanges {
  changes: BulkValues;
  /** Readable parts of the Batch summary, e.g. "Payee Migros". */
  summary: string[];
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

  if (input.payeeName !== undefined || input.payeeId !== undefined) {
    const payee = input.payeeName
      ? await findOrCreatePayee(scope, input.payeeName)
      : input.payeeId
        ? await findPayee(scope.tx, input.payeeId)
        : null;
    changes.payeeId = payee?.id ?? null;
    summary.push(`Payee ${payee?.name ?? 'cleared'}`);
  }
  if (input.categoryId !== undefined) {
    const category = input.categoryId ? await findCategory(scope.tx, input.categoryId) : null;
    changes.categoryId = category?.id ?? null;
    summary.push(`Category ${category ? `${category.groupName} › ${category.name}` : 'cleared'}`);
  }
  if (input.tagNames !== undefined || input.tagIds !== undefined) {
    const tags = input.tagNames
      ? await findOrCreateTags(scope, input.tagNames)
      : await Promise.all((input.tagIds ?? []).map((id) => findTag(scope.tx, id)));
    const unique = [...new Map(tags.map((tag) => [tag.id, tag])).values()];
    changes.tagIds = unique.map((tag) => tag.id);
    summary.push(`Tags ${unique.map((tag) => tag.name).join(', ') || 'cleared'}`);
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
    tags: values.tagIds !== undefined,
  };
  return CLASSIFICATION_FIELDS.filter((field) => touched[field]);
}

/** Writes and locks the given fields on every Transaction, in a few set-based statements. */
async function writeAll({ tx }: MutationScope, ids: string[], values: BulkValues): Promise<void> {
  if (values.categoryId && (await anyInTransfer(tx, ids))) {
    throw new ValidationError("A Transfer can't have a Category");
  }
  // Locks stay in CLASSIFICATION_FIELDS order: the current locks plus the edited fields.
  await tx.query(
    `UPDATE "transaction" t
     SET payee_id = CASE WHEN $2 THEN $3::uuid ELSE t.payee_id END,
         category_id = CASE WHEN $4 THEN $5::uuid ELSE t.category_id END,
         locked_fields = ARRAY(
           SELECT f.name FROM unnest($6::text[]) WITH ORDINALITY AS f(name, n)
           WHERE f.name = ANY(t.locked_fields) OR f.name = ANY($7::text[])
           ORDER BY f.n)
     WHERE t.id = ANY($1::uuid[])`,
    [
      ids,
      values.payeeId !== undefined,
      values.payeeId ?? null,
      values.categoryId !== undefined,
      values.categoryId ?? null,
      CLASSIFICATION_FIELDS,
      editedFields(values),
    ],
  );
  if (values.tagIds === undefined) return;
  await tx.query('DELETE FROM transaction_tag WHERE transaction_id = ANY($1::uuid[])', [ids]);
  await tx.query(
    `INSERT INTO transaction_tag (transaction_id, tag_id, source)
     SELECT transaction_id, tag_id, 'manual'
     FROM unnest($1::uuid[]) AS transaction_id CROSS JOIN unnest($2::uuid[]) AS tag_id`,
    [ids, values.tagIds],
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
    const ids = await selectTransactions(scope, values);
    if (ids.length === 0) throw new ValidationError('Select at least one Transaction');
    await lockSelected(scope, ids);
    const { changes, summary } = await resolveChanges(scope, values.changes);
    await recordClassificationChanges(scope, ids, () => writeAll(scope, ids, changes));
    const noun = ids.length === 1 ? 'Transaction' : 'Transactions';
    await scope.history.summarize(`Bulk edit of ${ids.length} ${noun}: ${summary.join(', ')}`);
    return { batchId: scope.history.batchId, count: ids.length };
  });
}

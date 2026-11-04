import { z } from 'zod';
import { MAX_NOTES_LENGTH } from '@/lib/classification';
import { findCategory } from '../categories/model';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { parseInput, ValidationError } from '../errors';
import { findOrCreateTags, findTag, tagName } from '../tags/model';
import {
  CLASSIFICATION_FIELDS,
  classificationSnapshot,
  lockTransaction,
  requireClassification,
  type Classification,
} from './classification';

/**
 * Splits (ADR-0004): a Split divides one Transaction's amount into Split lines, each with its
 * own Category, Tags and note. The Transaction itself (bank fields, amount, Payee, Tags,
 * notes) is unchanged; its own Category is empty while it is split. Splitting is a manual
 * classification: it locks the Category against the Rules.
 */

const splitLineInput = z
  .object({
    /** An existing line of the same Transaction, updated in place; absent for a new line. */
    id: z.string().min(1).optional(),
    /** Signed minor units of the Transaction's Currency. */
    amountMinor: z
      .number({ error: 'Every Split line needs an amount' })
      .int('Split line amounts must be in minor units')
      .refine((value) => Number.isSafeInteger(value), 'Split line amount is too large'),
    /** Required, except on a line that is a Transfer side: that one can't have a Category. */
    categoryId: z
      .string({ error: 'Every Split line needs a Category' })
      .min(1, 'Every Split line needs a Category')
      .nullish(),
    tagIds: z.array(z.string()).optional(),
    /** Or Tags by name, creating the missing ones. */
    tagNames: z.array(tagName).optional(),
    note: z
      .string()
      .trim()
      .max(MAX_NOTES_LENGTH, `Notes must be at most ${MAX_NOTES_LENGTH} characters`)
      .transform((note) => note || null)
      .nullable()
      .optional(),
  })
  .strict();

const splitLinesInput = z.array(splitLineInput).min(2, 'A Split needs at least two lines');

/** One Split line to write. Absent Tags and note mean none. */
export type SplitLineInput = z.input<typeof splitLineInput>;
type ParsedLine = z.output<typeof splitLineInput>;

/**
 * Maps `items` one at a time, in order: lookups that may create Tags must not overlap on one
 * database transaction.
 */
async function mapInOrder<T, R>(items: readonly T[], map: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(
    async (done, item) => [...(await done), await map(item)],
    Promise.resolve([]),
  );
}

async function resolveLineTagIds(scope: MutationScope, line: ParsedLine): Promise<string[]> {
  if (line.tagNames) return (await findOrCreateTags(scope, line.tagNames)).map((tag) => tag.id);
  const tags = await mapInOrder(line.tagIds ?? [], (id) => findTag(scope.tx, id));
  return [...new Set(tags.map((tag) => tag.id))];
}

/** Why a Split line that is a Transfer side can't be dropped, nor its Split removed. */
export const UNLINK_TRANSFER_FIRST = 'This Split holds a Transfer line: unlink the Transfer first';

/**
 * The Transfer each of the Transaction's Split lines is a side of (null when none), by line id.
 * The Transaction must be locked: linking a line locks its Transaction too.
 */
async function lineTransfers(
  scope: MutationScope,
  transactionId: string,
): Promise<Map<string, string | null>> {
  const existing = await scope.tx.query<{ id: string; transferId: string | null }>(
    'SELECT id, transfer_id AS "transferId" FROM split_line WHERE transaction_id = $1',
    [transactionId],
  );
  return new Map(existing.rows.map((row) => [row.id, row.transferId]));
}

/**
 * Refuses line ids that are not lines of this Transaction, or that are given twice: a line can
 * only be updated in place by its own Split. Also refuses dropping a line that is a Transfer
 * side (ADR-0005).
 */
function requireOwnLineIds(
  transfers: ReadonlyMap<string, string | null>,
  lines: readonly ParsedLine[],
): void {
  const given = lines.flatMap((line) => (line.id === undefined ? [] : [line.id]));
  if (new Set(given).size !== given.length) {
    throw new ValidationError('A Split line can only be given once');
  }
  if (given.some((id) => !transfers.has(id))) {
    throw new ValidationError('A Split line can only be edited on its own Transaction');
  }
  const kept = new Set(given);
  const dropsTransferLine = [...transfers].some(([id, transferId]) => transferId && !kept.has(id));
  if (dropsTransferLine) throw new ValidationError(UNLINK_TRANSFER_FIRST);
}

/**
 * The Category id a line gets: its own, or none for a Transfer side, which can't have one.
 * Every other line needs a Category.
 */
async function resolveLineCategoryId(
  scope: MutationScope,
  transfers: ReadonlyMap<string, string | null>,
  line: ParsedLine,
): Promise<string | null> {
  const isTransferSide = line.id !== undefined && Boolean(transfers.get(line.id));
  if (isTransferSide) {
    if (line.categoryId != null) {
      throw new ValidationError("This Split line is part of a Transfer: it can't have a Category");
    }
    return null;
  }
  if (line.categoryId == null) throw new ValidationError('Every Split line needs a Category');
  return (await findCategory(scope.tx, line.categoryId)).id;
}

/**
 * Makes `lines`, in their order, the Transaction's Split lines: lines given by id are updated
 * in place and keep their identity, lines without an id are added, and the others are deleted.
 */
async function writeLines(
  scope: MutationScope,
  transactionId: string,
  lines: readonly ParsedLine[],
): Promise<void> {
  const { tx } = scope;
  const transfers = await lineTransfers(scope, transactionId);
  requireOwnLineIds(transfers, lines);
  const categoryIds = await mapInOrder(lines, (line) =>
    resolveLineCategoryId(scope, transfers, line),
  );
  const tagIds = await mapInOrder(lines, (line) => resolveLineTagIds(scope, line));
  // One statement for the whole set: the database checks a Split per statement.
  const written = await tx.query<{ id: string; position: number }>(
    `WITH line AS (
       SELECT * FROM unnest($2::uuid[], $3::bigint[], $4::uuid[], $5::text[]) WITH ORDINALITY
         AS line(id, amount, category, note, n)
     ), removed AS (
       DELETE FROM split_line sl
       WHERE sl.transaction_id = $1
         AND NOT EXISTS (SELECT 1 FROM line WHERE line.id = sl.id)
     ), updated AS (
       UPDATE split_line sl
       SET position = line.n, amount_minor = line.amount, category_id = line.category,
           note = line.note
       FROM line
       WHERE sl.id = line.id AND sl.transaction_id = $1
       RETURNING sl.id, sl.position
     ), inserted AS (
       INSERT INTO split_line (transaction_id, position, amount_minor, category_id, note)
       SELECT $1, line.n, line.amount, line.category, line.note
       FROM line WHERE line.id IS NULL
       RETURNING id, position
     )
     SELECT id, position FROM updated UNION ALL SELECT id, position FROM inserted`,
    [
      transactionId,
      lines.map((line) => line.id ?? null),
      lines.map((line) => line.amountMinor),
      categoryIds,
      lines.map((line) => line.note ?? null),
    ],
  );
  const idAt = new Map(written.rows.map((row) => [row.position, row.id]));
  const lineIdAt = (position: number): string => {
    const id = idAt.get(position);
    if (id === undefined) throw new Error(`Split line ${position} was not written`);
    return id;
  };
  const lineIds = lines.map((_, index) => lineIdAt(index + 1));
  await tx.query('DELETE FROM split_line_tag WHERE split_line_id = ANY($1::uuid[])', [lineIds]);
  const pairs = tagIds.flatMap((ids, index) => ids.map((tagId) => [lineIds[index]!, tagId]));
  if (pairs.length === 0) return;
  await tx.query(
    `INSERT INTO split_line_tag (split_line_id, tag_id)
     SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
    [pairs.map(([lineId]) => lineId), pairs.map(([, tagId]) => tagId)],
  );
}

/**
 * Splits a Transaction into `lines`, or edits its Split: lines given by the id of one of its
 * Split lines are updated in place, others are added, and lines not given are deleted. The
 * lines need a Category each, except a line that is a Transfer side (ADR-0005): it keeps its
 * Transfer, can't get a Category and can't be dropped. The lines must sum exactly to the
 * Transaction's amount; signs may differ. One Batch.
 */
export async function splitTransaction(
  ctx: ServiceContext,
  transactionId: string,
  lines: readonly SplitLineInput[],
): Promise<Classification> {
  const values = parseInput(splitLinesInput, lines);
  return mutate(ctx, async (scope) => {
    const transaction = await lockTransaction(scope, transactionId);
    if (transaction.transferId !== null) {
      throw new ValidationError(
        'This Transaction is part of a Transfer: unlink the Transfer before splitting it',
      );
    }
    const total = values.reduce((sum, line) => sum + line.amountMinor, 0);
    if (total !== transaction.amountMinor) {
      throw new ValidationError("The Split lines must add up exactly to the Transaction's amount");
    }
    const before = await requireClassification(scope.tx, transactionId);
    const lockedFields = CLASSIFICATION_FIELDS.filter(
      (field) => field === 'category' || before.lockedFields.includes(field),
    );
    await scope.tx.query(
      'UPDATE "transaction" SET category_id = NULL, locked_fields = $2 WHERE id = $1',
      [transactionId, lockedFields],
    );
    await writeLines(scope, transactionId, values);
    const after = await requireClassification(scope.tx, transactionId);
    await scope.history.record(
      'transaction',
      transactionId,
      classificationSnapshot(before),
      classificationSnapshot(after),
    );
    return after;
  });
}

/**
 * Removes a Transaction's Split: it goes back to Unclassified. Refused while a line is a
 * Transfer side. One Batch.
 */
export async function removeSplit(
  ctx: ServiceContext,
  transactionId: string,
): Promise<Classification> {
  return mutate(ctx, async (scope) => {
    await lockTransaction(scope, transactionId);
    const before = await requireClassification(scope.tx, transactionId);
    if (before.splitLines.length === 0) throw new ValidationError('This Transaction is not split');
    // A Transfer line keeps its Transfer until it is unlinked (ADR-0005). The Transaction is
    // locked, so no line can be linked under this check.
    if (before.splitLines.some((line) => line.transferId !== null)) {
      throw new ValidationError(UNLINK_TRANSFER_FIRST);
    }
    await scope.tx.query('DELETE FROM split_line WHERE transaction_id = $1', [transactionId]);
    // Truly Unclassified again: the Category lock the Split set goes too, so Rules may classify it.
    await scope.tx.query(
      `UPDATE "transaction" SET locked_fields = array_remove(locked_fields, 'category')
       WHERE id = $1`,
      [transactionId],
    );
    const after = await requireClassification(scope.tx, transactionId);
    await scope.history.record(
      'transaction',
      transactionId,
      classificationSnapshot(before),
      classificationSnapshot(after),
    );
    return after;
  });
}

import { z } from 'zod';
import { findCategory } from '../categories/model';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { parseInput, ValidationError } from '../errors';
import { findOrCreateTags, findTag, tagName } from '../tags/model';
import {
  CLASSIFICATION_FIELDS,
  classificationSnapshot,
  lockTransaction,
  MAX_NOTES_LENGTH,
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
    /** Signed minor units of the Transaction's Currency. */
    amountMinor: z
      .number({ error: 'Every Split line needs an amount' })
      .int('Split line amounts must be in minor units')
      .refine((value) => Number.isSafeInteger(value), 'Split line amount is too large'),
    categoryId: z
      .string({ error: 'Every Split line needs a Category' })
      .min(1, 'Every Split line needs a Category'),
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

async function resolveLineTagIds(scope: MutationScope, line: ParsedLine): Promise<string[]> {
  if (line.tagNames) return (await findOrCreateTags(scope, line.tagNames)).map((tag) => tag.id);
  const ids = [];
  for (const id of line.tagIds ?? []) ids.push((await findTag(scope.tx, id)).id);
  return [...new Set(ids)];
}

/** Replaces the Transaction's Split lines with `lines`, in their order. */
async function writeLines(
  scope: MutationScope,
  transactionId: string,
  lines: readonly ParsedLine[],
): Promise<void> {
  const { tx } = scope;
  const categoryIds = [];
  const tagIds = [];
  for (const line of lines) {
    categoryIds.push((await findCategory(tx, line.categoryId)).id);
    tagIds.push(await resolveLineTagIds(scope, line));
  }
  await tx.query('DELETE FROM split_line WHERE transaction_id = $1', [transactionId]);
  // One INSERT for the whole set: the database checks a Split per statement.
  const inserted = await tx.query<{ id: string; position: number }>(
    `INSERT INTO split_line (transaction_id, position, amount_minor, category_id, note)
     SELECT $1, line.n, line.amount, line.category, line.note
     FROM unnest($2::bigint[], $3::uuid[], $4::text[]) WITH ORDINALITY
       AS line(amount, category, note, n)
     RETURNING id, position`,
    [
      transactionId,
      lines.map((line) => line.amountMinor),
      categoryIds,
      lines.map((l) => l.note ?? null),
    ],
  );
  const idAt = new Map(inserted.rows.map((row) => [row.position, row.id]));
  const pairs = tagIds.flatMap((ids, index) => ids.map((tagId) => [idAt.get(index + 1)!, tagId]));
  if (pairs.length === 0) return;
  await tx.query(
    `INSERT INTO split_line_tag (split_line_id, tag_id)
     SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
    [pairs.map(([lineId]) => lineId), pairs.map(([, tagId]) => tagId)],
  );
}

/**
 * Splits a Transaction into `lines`, replacing any Split it already has. The lines need a
 * Category each and must sum exactly to the Transaction's amount; signs may differ. One Batch.
 */
export async function splitTransaction(
  ctx: ServiceContext,
  transactionId: string,
  lines: readonly SplitLineInput[],
): Promise<Classification> {
  const values = parseInput(splitLinesInput, lines);
  return mutate(ctx, async (scope) => {
    const transaction = await lockTransaction(scope, transactionId);
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

/** Removes a Transaction's Split: it goes back to Unclassified. One Batch. */
export async function removeSplit(
  ctx: ServiceContext,
  transactionId: string,
): Promise<Classification> {
  return mutate(ctx, async (scope) => {
    await lockTransaction(scope, transactionId);
    const before = await requireClassification(scope.tx, transactionId);
    if (before.splitLines.length === 0) throw new ValidationError('This Transaction is not split');
    await scope.tx.query('DELETE FROM split_line WHERE transaction_id = $1', [transactionId]);
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

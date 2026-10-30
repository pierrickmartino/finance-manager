import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import type { CategoryGroupType } from '../categories';
import { findCategory } from '../categories/model';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import type { HistorySnapshot } from '../history';
import { findOrCreatePayee, findPayee, payeeName } from '../payees/model';
import { findOrCreateTags, findTag, tagName } from '../tags/model';
import { refuseBankFieldChanges } from './bank-fields';
import { SELECT_TRANSACTION, type Transaction } from './model';
import { isInTransfer } from './transfer-guard';

/**
 * Classification of one Transaction: Payee, Category, Tags and notes (spec 63-65).
 *
 * Locking: a manual edit locks every field it was given (even to clear it), so Rules never
 * write it again; `unlockFields` hands a field back to the Rules. Locks live in
 * `transaction.locked_fields`, using the names in CLASSIFICATION_FIELDS.
 *
 * `editClassification` is the single-Transaction operation. `applyClassification` does the
 * same inside an open mutation: bulk edit (#16) calls it once per Transaction with
 * `{ by: 'manual' }`, and the Rules engine (#17) with `{ by: 'rule' }`.
 */

export const CLASSIFICATION_FIELDS = ['payee', 'category', 'tags', 'notes'] as const;
export type ClassificationField = (typeof CLASSIFICATION_FIELDS)[number];

export const CLASSIFICATION_FIELD_LABELS: Record<ClassificationField, string> = {
  payee: 'Payee',
  category: 'Category',
  tags: 'Tags',
  notes: 'Notes',
};

export type TagSource = 'manual' | 'rule';

export interface Classification {
  transactionId: string;
  payee: { id: string; name: string } | null;
  category: {
    id: string;
    name: string;
    groupId: string;
    groupName: string;
    groupType: CategoryGroupType;
  } | null;
  /** By name, ignoring case. */
  tags: { id: string; name: string; source: TagSource }[];
  notes: string | null;
  /** Fields Rules may not write, in CLASSIFICATION_FIELDS order. */
  lockedFields: ClassificationField[];
}

const MAX_NOTES_LENGTH = 2000;

const optionalId = z.string().nullable().optional();

const changesInput = z
  .object({
    /** The Payee to set; null clears it. */
    payeeId: optionalId,
    /** Or the Payee's name: an existing Payee (ignoring case), or a new one. */
    payeeName: payeeName.nullable().optional(),
    categoryId: optionalId,
    /** The full set of Tags; for a Rule, the Tags to add. */
    tagIds: z.array(z.string()).optional(),
    /** Or Tags by name, creating the missing ones. */
    tagNames: z.array(tagName).optional(),
    notes: z
      .string()
      .trim()
      .max(MAX_NOTES_LENGTH, `Notes must be at most ${MAX_NOTES_LENGTH} characters`)
      .transform((notes) => notes || null)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((input) => input.payeeId === undefined || input.payeeName === undefined, {
    message: 'Give the Payee by id or by name, not both',
  })
  .refine((input) => input.tagIds === undefined || input.tagNames === undefined, {
    message: 'Give the Tags by id or by name, not both',
  });

/** The fields to change; absent fields are left alone. */
export type ClassificationChanges = z.input<typeof changesInput>;
type ParsedChanges = z.output<typeof changesInput>;

export interface ApplyOptions {
  /**
   * `manual`: writes every given field and locks it; the given Tags replace the current ones.
   * `rule`: skips locked fields, locks nothing, and adds the given Tags.
   */
  by: TagSource;
}

const fieldList = z.array(
  z.enum(CLASSIFICATION_FIELDS, { error: 'Fields must be Payee, Category, Tags or Notes' }),
);

const SELECT_CLASSIFICATION = `
  SELECT t.id AS "transactionId",
         CASE WHEN p.id IS NULL THEN NULL
              ELSE json_build_object('id', p.id, 'name', p.name) END AS payee,
         CASE WHEN c.id IS NULL THEN NULL
              ELSE json_build_object('id', c.id, 'name', c.name, 'groupId', g.id,
                'groupName', g.name, 'groupType', g.type) END AS category,
         coalesce((SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name,
                     'source', tt.source) ORDER BY lower(tg.name), tg.id)
                   FROM transaction_tag tt JOIN tag tg ON tg.id = tt.tag_id
                   WHERE tt.transaction_id = t.id), '[]'::json) AS tags,
         t.notes, t.locked_fields AS "lockedFields"
  FROM "transaction" t
  LEFT JOIN payee p ON p.id = t.payee_id
  LEFT JOIN category c ON c.id = t.category_id
  LEFT JOIN category_group g ON g.id = c.group_id`;

/** The classification of each given Transaction (those that exist), in no particular order. */
export async function loadClassifications(
  db: Queryable,
  transactionIds: readonly string[],
): Promise<Classification[]> {
  const result = await db.query<Classification>(
    `${SELECT_CLASSIFICATION} WHERE t.id = ANY($1::uuid[])`,
    [transactionIds],
  );
  return result.rows;
}

/** What History records about a Transaction's classification: readable names. */
export function classificationSnapshot(classification: Classification): HistorySnapshot {
  const { payee, category, tags, notes, lockedFields } = classification;
  return {
    payee: payee?.name ?? null,
    category: category ? `${category.groupName} › ${category.name}` : null,
    tags: tags.map((tag) => tag.name),
    notes,
    lockedFields: [...lockedFields],
  };
}

/**
 * Runs `change` on Transactions' classification inside an open mutation, then records how each
 * of them changed (one History entry per changed field, in the scope's Batch). Merges and
 * deletes of Payees, Categories and Tags use it.
 */
export async function recordClassificationChanges<T>(
  scope: MutationScope,
  transactionIds: readonly string[],
  change: () => Promise<T>,
): Promise<T> {
  await scope.tx.query('SELECT 1 FROM "transaction" WHERE id = ANY($1::uuid[]) FOR UPDATE', [
    transactionIds,
  ]);
  const before = await loadClassifications(scope.tx, transactionIds);
  const result = await change();
  const after = new Map(
    (await loadClassifications(scope.tx, transactionIds)).map((row) => [row.transactionId, row]),
  );
  for (const old of before) {
    const now = after.get(old.transactionId);
    await scope.history.record(
      'transaction',
      old.transactionId,
      classificationSnapshot(old),
      now ? classificationSnapshot(now) : null,
    );
  }
  return result;
}

const transactionId = z.uuid();

async function lockTransaction(scope: MutationScope, id: string): Promise<Transaction> {
  const notFound = new NotFoundError('Transaction not found');
  if (!transactionId.safeParse(id).success) throw notFound;
  const result = await scope.tx.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.id = $1 FOR UPDATE`,
    [id],
  );
  const transaction = result.rows[0];
  if (!transaction) throw notFound;
  return transaction;
}

async function requireClassification(db: Queryable, id: string): Promise<Classification> {
  const [classification] = await loadClassifications(db, [id]);
  if (!classification) throw new NotFoundError('Transaction not found');
  return classification;
}

/** The fields the changes touch. */
function editedFields(changes: ParsedChanges): ClassificationField[] {
  const touched: Record<ClassificationField, boolean> = {
    payee: changes.payeeId !== undefined || changes.payeeName !== undefined,
    category: changes.categoryId !== undefined,
    tags: changes.tagIds !== undefined || changes.tagNames !== undefined,
    notes: changes.notes !== undefined,
  };
  return CLASSIFICATION_FIELDS.filter((field) => touched[field]);
}

async function resolvePayeeId(
  scope: MutationScope,
  changes: ParsedChanges,
): Promise<string | null> {
  if (changes.payeeName) return (await findOrCreatePayee(scope, changes.payeeName)).id;
  if (changes.payeeId) return (await findPayee(scope.tx, changes.payeeId)).id;
  return null;
}

async function resolveTagIds(scope: MutationScope, changes: ParsedChanges): Promise<string[]> {
  if (changes.tagNames) return (await findOrCreateTags(scope, changes.tagNames)).map((t) => t.id);
  const tags = [];
  for (const id of changes.tagIds ?? []) tags.push((await findTag(scope.tx, id)).id);
  return tags;
}

async function writeTags(
  scope: MutationScope,
  id: string,
  tagIds: readonly string[],
  by: TagSource,
): Promise<void> {
  if (by === 'manual') {
    await scope.tx.query('DELETE FROM transaction_tag WHERE transaction_id = $1', [id]);
  }
  await scope.tx.query(
    `INSERT INTO transaction_tag (transaction_id, tag_id, source)
     SELECT $1, tag_id, $3 FROM unnest($2::uuid[]) AS tag_id
     ON CONFLICT (transaction_id, tag_id) DO NOTHING`,
    [id, [...new Set(tagIds)], by],
  );
}

/** Writes one field's new value. */
async function writeField(
  scope: MutationScope,
  id: string,
  field: ClassificationField,
  changes: ParsedChanges,
  by: TagSource,
): Promise<void> {
  const { tx } = scope;
  switch (field) {
    case 'payee':
      await tx.query('UPDATE "transaction" SET payee_id = $1 WHERE id = $2', [
        await resolvePayeeId(scope, changes),
        id,
      ]);
      return;
    case 'category': {
      const categoryId = changes.categoryId
        ? (await findCategory(tx, changes.categoryId)).id
        : null;
      if (categoryId && (await isInTransfer(tx, id))) {
        throw new ValidationError("A Transfer can't have a Category");
      }
      await tx.query('UPDATE "transaction" SET category_id = $1 WHERE id = $2', [categoryId, id]);
      return;
    }
    case 'tags':
      await writeTags(scope, id, await resolveTagIds(scope, changes), by);
      return;
    case 'notes':
      await tx.query('UPDATE "transaction" SET notes = $1 WHERE id = $2', [
        changes.notes ?? null,
        id,
      ]);
  }
}

/**
 * Classifies one Transaction inside an open mutation and records the change in its Batch.
 * See ApplyOptions for how a manual edit and a Rule differ.
 */
export async function applyClassification(
  scope: MutationScope,
  id: string,
  changes: ClassificationChanges,
  { by }: ApplyOptions,
): Promise<Classification> {
  const transaction = await lockTransaction(scope, id);
  refuseBankFieldChanges(transaction, changes as Partial<Transaction>);
  const values = parseInput(changesInput, changes);
  const before = await requireClassification(scope.tx, id);
  const locked = new Set<ClassificationField>(before.lockedFields);
  const fields = editedFields(values).filter((field) => by === 'manual' || !locked.has(field));

  for (const field of fields) await writeField(scope, id, field, values, by);
  if (by === 'manual') {
    const lockedFields = CLASSIFICATION_FIELDS.filter((f) => locked.has(f) || fields.includes(f));
    await scope.tx.query('UPDATE "transaction" SET locked_fields = $1 WHERE id = $2', [
      lockedFields,
      id,
    ]);
  }

  const after = await requireClassification(scope.tx, id);
  await scope.history.record(
    'transaction',
    id,
    classificationSnapshot(before),
    classificationSnapshot(after),
  );
  return after;
}

export async function getClassification(ctx: ServiceContext, id: string): Promise<Classification> {
  if (!transactionId.safeParse(id).success) throw new NotFoundError('Transaction not found');
  return requireClassification(ctx.db, id);
}

/**
 * Edits a Transaction's Payee, Category, Tags and notes by hand (spec 63). Every given field
 * is locked against the Rules (spec 64); absent fields are left alone.
 */
export async function editClassification(
  ctx: ServiceContext,
  id: string,
  changes: ClassificationChanges,
): Promise<Classification> {
  return mutate(ctx, (scope) => applyClassification(scope, id, changes, { by: 'manual' }));
}

/** Hands fields back to the Rules (spec 65). Their values stay until a Rule changes them. */
export async function unlockFields(
  ctx: ServiceContext,
  id: string,
  fields: readonly ClassificationField[],
): Promise<Classification> {
  const unlock = new Set(parseInput(fieldList, fields));
  return mutate(ctx, async (scope) => {
    await lockTransaction(scope, id);
    const before = await requireClassification(scope.tx, id);
    const lockedFields = before.lockedFields.filter((field) => !unlock.has(field));
    await scope.tx.query('UPDATE "transaction" SET locked_fields = $1 WHERE id = $2', [
      lockedFields,
      id,
    ]);
    const after = await requireClassification(scope.tx, id);
    await scope.history.record(
      'transaction',
      id,
      classificationSnapshot(before),
      classificationSnapshot(after),
    );
    return after;
  });
}

import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import type { MutationScope } from '../context';
import { ConflictError, isUniqueViolation, NotFoundError } from '../errors';

export interface Tag {
  id: string;
  name: string;
  /** How many Transactions carry this Tag. */
  transactionCount: number;
}

const MAX_NAME_LENGTH = 100;

export const tagName = z
  .string()
  .trim()
  .min(1, 'Tag name is required')
  .max(MAX_NAME_LENGTH, `Tag name must be at most ${MAX_NAME_LENGTH} characters`);

export const SELECT_TAG = `
  SELECT g.id, g.name,
         (SELECT count(*)::int FROM transaction_tag tt WHERE tt.tag_id = g.id)
           AS "transactionCount"
  FROM tag g`;

export async function findTag(db: Queryable, id: string, lock = false): Promise<Tag> {
  const notFound = new NotFoundError('Tag not found');
  if (!z.uuid().safeParse(id).success) throw notFound;
  const result = await db.query<Tag>(
    `${SELECT_TAG} WHERE g.id = $1${lock ? ' FOR UPDATE OF g' : ''}`,
    [id],
  );
  const tag = result.rows[0];
  if (!tag) throw notFound;
  return tag;
}

/** Maps the name uniqueness violation to a user message. */
export async function uniqueTagName<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'tag_name_unique')) {
      throw new ConflictError(`A Tag named "${name}" already exists`);
    }
    throw error;
  }
}

/** Inserts a Tag inside an open mutation, recording it. */
export async function insertTag({ tx, history }: MutationScope, name: string): Promise<Tag> {
  const inserted = await uniqueTagName(name, () =>
    tx.query<{ id: string }>('INSERT INTO tag (name) VALUES ($1) RETURNING id', [name]),
  );
  const tag = await findTag(tx, inserted.rows[0]!.id);
  await history.record('tag', tag.id, null, { name: tag.name });
  return tag;
}

/** The Tags with these names (ignoring case), creating the missing ones, in the given order. */
export async function findOrCreateTags(
  scope: MutationScope,
  names: readonly string[],
): Promise<Tag[]> {
  const tags: Tag[] = [];
  for (const name of names) {
    const existing = await scope.tx.query<Tag>(`${SELECT_TAG} WHERE lower(g.name) = lower($1)`, [
      name,
    ]);
    tags.push(existing.rows[0] ?? (await insertTag(scope, name)));
  }
  return tags;
}

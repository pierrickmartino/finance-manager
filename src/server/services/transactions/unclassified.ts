import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { listTransactions, type TransactionPage } from '.';
import { MAX_PAGE_SIZE, UNCLASSIFIED_CONDITION } from './query';

/**
 * The classification work queue (spec 60, 61, 68): Unclassified Transactions grouped by their
 * normalised raw description (`transaction.description_key`), largest group first, and the
 * share of Transactions still Unclassified.
 */

/** At most this share of Transactions may stay Unclassified (spec success criteria). */
export const UNCLASSIFIED_TARGET = 0.02;

export const DEFAULT_GROUP_PAGE_SIZE = 50;

/** One group of Unclassified Transactions sharing a normalised raw description. */
export interface UnclassifiedGroup {
  /** The normalised raw description; identifies the group. */
  key: string;
  /** The group's most common raw description as the bank wrote it. */
  description: string;
  count: number;
  latestBookingDate: string;
}

export interface UnclassifiedGroupPage {
  groups: UnclassifiedGroup[];
  totalGroups: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ClassificationProgress {
  total: number;
  unclassified: number;
  /** unclassified / total, between 0 and 1; 0 when there are no Transactions. */
  share: number;
  target: number;
  isTargetMet: boolean;
}

const groupPageInput = z.object({
  page: z.number().int().min(1, 'Page must be 1 or more').default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE, `At most ${MAX_PAGE_SIZE} groups per page`)
    .default(DEFAULT_GROUP_PAGE_SIZE),
});

/** Unclassified groups, most Transactions first (ties by description), one page at a time. */
export async function listUnclassifiedGroups(
  ctx: ServiceContext,
  query: z.input<typeof groupPageInput> = {},
): Promise<UnclassifiedGroupPage> {
  const { page, pageSize } = parseInput(groupPageInput, query);
  const [count, rows] = await Promise.all([
    ctx.db.query<{ total: number }>(
      `SELECT count(DISTINCT t.description_key)::int AS total
       FROM "transaction" t WHERE ${UNCLASSIFIED_CONDITION}`,
    ),
    ctx.db.query<UnclassifiedGroup>(
      `SELECT t.description_key AS key,
              mode() WITHIN GROUP (ORDER BY t.raw_description) AS description,
              count(*)::int AS count,
              max(t.booking_date) AS "latestBookingDate"
       FROM "transaction" t
       WHERE ${UNCLASSIFIED_CONDITION}
       GROUP BY t.description_key
       ORDER BY count(*) DESC, t.description_key
       LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize],
    ),
  ]);
  const totalGroups = count.rows[0]?.total ?? 0;
  return {
    groups: rows.rows,
    totalGroups,
    page,
    pageSize,
    pageCount: Math.ceil(totalGroups / pageSize),
  };
}

/** The Unclassified Transactions of one group, newest first, one page at a time. */
export async function listUnclassifiedGroupTransactions(
  ctx: ServiceContext,
  key: string,
  { page = 1, pageSize = MAX_PAGE_SIZE }: { page?: number; pageSize?: number } = {},
): Promise<TransactionPage> {
  return listTransactions(ctx, { unclassified: true, descriptionKey: key, page, pageSize });
}

/** The share of Transactions Unclassified, against the 2% target (spec 68). */
export async function getClassificationProgress(
  ctx: ServiceContext,
): Promise<ClassificationProgress> {
  const result = await ctx.db.query<{ total: number; unclassified: number }>(
    `SELECT count(*)::int AS total,
            (count(*) FILTER (WHERE ${UNCLASSIFIED_CONDITION}))::int AS unclassified
     FROM "transaction" t`,
  );
  const { total, unclassified } = result.rows[0] ?? { total: 0, unclassified: 0 };
  const share = total === 0 ? 0 : unclassified / total;
  return {
    total,
    unclassified,
    share,
    target: UNCLASSIFIED_TARGET,
    isTargetMet: share <= UNCLASSIFIED_TARGET,
  };
}

import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { SELECT_TRANSACTION, type Transaction } from '../transactions/model';

/**
 * The sides of a Transfer (ADR-0005): each is either a whole Transaction or one Split line of
 * a Transaction. A side's Account is its Transaction's (a line's parent's), and its sign that of
 * its own amount. Both kinds hold their Transfer in a `transfer_id` column: `transaction` for a
 * whole Transaction, `split_line` for a line.
 */

export const TRANSFER_SIDE_KINDS = ['transaction', 'splitLine'] as const;
export type TransferSideKind = (typeof TRANSFER_SIDE_KINDS)[number];

/** Names one side: a Transaction id, or a Split line id. */
export interface TransferSideRef {
  kind: TransferSideKind;
  id: string;
}

export const transactionSide = (id: string): TransferSideRef => ({ kind: 'transaction', id });
export const splitLineSide = (id: string): TransferSideRef => ({ kind: 'splitLine', id });

export const sameSide = (a: TransferSideRef, b: TransferSideRef): boolean =>
  a.kind === b.kind && a.id === b.id;

export const transferSideInput = z
  .object({
    kind: z.enum(TRANSFER_SIDE_KINDS, { error: 'A side is a Transaction or a Split line' }),
    id: z.uuid({ error: 'Transaction not found' }),
  })
  .strict();

/** Sorted by kind, then id: the order a Transfer lists and records its sides in. */
export function sortSides<T extends TransferSideRef>(sides: readonly T[]): T[] {
  return [...sides].sort((a, b) =>
    a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind),
  );
}

export const sideLabel = (kind: TransferSideKind): string =>
  kind === 'transaction' ? 'Transaction' : 'Split line';

/** An existing Transaction with its Account name, as Transfer options and counterparts show it. */
export interface CandidateTransaction extends Transaction {
  accountName: string;
}

/** A side as the Transfers service shows it: what it is, its amount and its Transaction. */
export interface TransferSideView extends TransferSideRef {
  /** The side's own amount: the Transaction's, or the Split line's. */
  amountMinor: number;
  /** The Transaction, or the Split line's Transaction. */
  transaction: CandidateTransaction;
}

export const SELECT_WITH_ACCOUNT = SELECT_TRANSACTION.replace(
  'FROM "transaction" t',
  `, a.name AS "accountName" FROM "transaction" t JOIN account a ON a.id = t.account_id`,
);

/** One side's row before its Transaction is attached. */
export interface SideRow extends TransferSideRef {
  transactionId: string;
  amountMinor: number;
}

/** SQL columns of a `SideRow` from a whole Transaction (alias `t`). */
export const TRANSACTION_SIDE_COLUMNS = `'transaction' AS kind, t.id, t.id AS "transactionId",
  t.amount_minor AS "amountMinor"`;
/** SQL columns of a `SideRow` from a Split line (alias `sl`). */
export const SPLIT_LINE_SIDE_COLUMNS = `'splitLine' AS kind, sl.id,
  sl.transaction_id AS "transactionId", sl.amount_minor AS "amountMinor"`;

/** Attaches each side's Transaction (with its Account name), keeping the rows' order. */
export async function toSideViews(
  db: Queryable,
  rows: readonly SideRow[],
): Promise<TransferSideView[]> {
  if (rows.length === 0) return [];
  const result = await db.query<CandidateTransaction>(
    `${SELECT_WITH_ACCOUNT} WHERE t.id = ANY($1::uuid[])`,
    [[...new Set(rows.map((row) => row.transactionId))]],
  );
  const byId = new Map(result.rows.map((transaction) => [transaction.id, transaction]));
  return rows.map(({ kind, id, transactionId, amountMinor }) => ({
    kind,
    id,
    amountMinor,
    transaction: byId.get(transactionId)!,
  }));
}

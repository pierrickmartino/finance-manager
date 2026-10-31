import type { Queryable } from '@/server/db/client';
import { BASE_CURRENCY, loadRateTable } from '../fx';
import { SELECT_TRANSACTION, type Transaction } from '../transactions/model';
import {
  findTransferCandidates,
  TRANSFER_MAX_DAYS,
  type MatchEntry,
  type ToChf,
  type TransferCandidate,
} from './matcher';

/** An existing Transaction offered as the other side of a Transfer, with its Account name. */
export interface CandidateTransaction extends Transaction {
  accountName: string;
}

export type ImportTransferCandidate = TransferCandidate<CandidateTransaction>;

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

async function loadOtherAccountTransactions(
  db: Queryable,
  accountId: string,
  from: string,
  to: string,
): Promise<CandidateTransaction[]> {
  const result = await db.query<CandidateTransaction>(
    `${SELECT_TRANSACTION.replace(
      'FROM "transaction" t',
      `, a.name AS "accountName" FROM "transaction" t JOIN account a ON a.id = t.account_id`,
    )}
     WHERE t.account_id <> $1 AND t.transfer_id IS NULL AND t.booking_date BETWEEN $2 AND $3`,
    [accountId, from, to],
  );
  return result.rows;
}

async function loadAccountIbans(db: Queryable): Promise<Map<string, string | null>> {
  const result = await db.query<{ id: string; iban: string | null }>(
    'SELECT id, iban FROM account',
  );
  return new Map(result.rows.map((row) => [row.id, row.iban]));
}

/** The FX lookup for the matcher: CHF as is, other Currencies at the stored ECB rates. */
async function chfLookup(
  db: Queryable,
  currencies: ReadonlySet<string>,
  from: string,
  to: string,
): Promise<ToChf> {
  const foreign = [...currencies].filter((currency) => currency !== BASE_CURRENCY);
  if (foreign.length === 0) return (amountMinor) => amountMinor;
  const table = await loadRateTable({ db }, { currencies: foreign, from, to });
  return (amountMinor, currency, date) =>
    currency === BASE_CURRENCY
      ? amountMinor
      : (table.toChf(amountMinor, currency, date)?.amountMinor ?? null);
}

/**
 * Transfer candidates for the entries of an Import preview, in the entries' order (spec 83-87),
 * searched among the Transactions of all other Accounts that are not in a Transfer yet. Entries
 * that will never be added (`skip`) get none.
 */
export async function findImportTransferCandidates(
  db: Queryable,
  accountId: string,
  entries: readonly (Omit<MatchEntry, 'accountId'> & { skip: boolean })[],
): Promise<ImportTransferCandidate[][]> {
  const matchable = entries.filter((entry) => !entry.skip);
  if (matchable.length === 0) return entries.map(() => []);
  const dates = matchable.map((entry) => entry.bookingDate).sort();
  const from = shiftDays(dates[0]!, -TRANSFER_MAX_DAYS);
  const to = shiftDays(dates.at(-1)!, TRANSFER_MAX_DAYS);
  const existing = await loadOtherAccountTransactions(db, accountId, from, to);
  if (existing.length === 0) return entries.map(() => []);
  const currencies = new Set([...matchable, ...existing].map((row) => row.currency));
  const found = findTransferCandidates({
    entries: matchable.map((entry) => ({ ...entry, accountId })),
    existing,
    accountIbans: await loadAccountIbans(db),
    toChf: await chfLookup(db, currencies, from, to),
  });
  let next = 0;
  return entries.map((entry) => (entry.skip ? [] : found[next++]!));
}

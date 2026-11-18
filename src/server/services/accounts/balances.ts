import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { loadRateTable, type ChfValue } from '../fx';
import { swissToday } from '../fx/dates';
import { listAccounts, type Account } from '.';

/** An Account's balance on a date, in its own Currency and valued in CHF on that date. */
export interface AccountBalance {
  account: Account;
  date: string;
  /** Minor units of the Account's Currency at the end of `date`. */
  balanceMinor: number;
  /**
   * A snapshot-only Account (no Transactions) takes its balance from its latest Balance
   * snapshot on or before `date`: that snapshot's date. Null otherwise.
   */
  snapshotDate: string | null;
  /** The balance in CHF at the rate of `date` (or the most recent earlier one); null when no rate exists. */
  chf: ChfValue | null;
}

const balancesInput = z.object({
  date: z.iso.date({ error: 'Date must be a date (YYYY-MM-DD)' }).optional(),
});

/** Sum per Account of the Transactions booked after `date`. */
async function transactionsAfter(db: Queryable, date: string): Promise<Map<string, number>> {
  const result = await db.query<{ accountId: string; sumMinor: number }>(
    `SELECT account_id AS "accountId", sum(amount_minor)::bigint AS "sumMinor"
     FROM "transaction" WHERE booking_date > $1 GROUP BY account_id`,
    [date],
  );
  return new Map(result.rows.map((row) => [row.accountId, row.sumMinor]));
}

/** Per Account, its latest Balance snapshot on or before `date`. */
async function snapshotsOn(
  db: Queryable,
  date: string,
): Promise<Map<string, { date: string; balanceMinor: number }>> {
  const result = await db.query<{ accountId: string; date: string; balanceMinor: number }>(
    `SELECT DISTINCT ON (account_id) account_id AS "accountId", date,
            balance_minor AS "balanceMinor"
     FROM balance_snapshot WHERE date <= $1 ORDER BY account_id, date DESC`,
    [date],
  );
  return new Map(result.rows.map(({ accountId, ...snapshot }) => [accountId, snapshot]));
}

/**
 * A snapshot-only Account's balance on `date`: its latest snapshot by then, or else its
 * opening balance (nothing before the opening date).
 */
function snapshotBalanceOn(
  account: Account,
  date: string,
  snapshot: { date: string; balanceMinor: number } | undefined,
): { balanceMinor: number; snapshotDate: string | null } {
  if (snapshot) return { balanceMinor: snapshot.balanceMinor, snapshotDate: snapshot.date };
  const opened = !account.openingDate || account.openingDate <= date;
  return { balanceMinor: opened ? account.openingBalanceMinor : 0, snapshotDate: null };
}

/**
 * The balance on `date`, derived from the Account's current balance: minus what was booked
 * after that day, and nothing before the opening date.
 */
function balanceOn(account: Account, date: string, laterMinor: number): number {
  const opening =
    account.openingDate && account.openingDate > date ? account.openingBalanceMinor : 0;
  return account.balanceMinor - laterMinor - opening;
}

/** An Account and the day whose end its balance is asked for. */
export interface DatedAccount {
  account: Account;
  date: string;
}

/**
 * The native balance of each given Account at the end of its date, in the order given, in one
 * query for all of them; an Account may be asked for at many dates. As `listAccountBalances`
 * computes it: from Transactions, or a snapshot-only Account's latest Balance snapshot by then.
 */
export async function nativeBalancesAt(
  db: Queryable,
  datedAccounts: readonly DatedAccount[],
): Promise<number[]> {
  if (datedAccounts.length === 0) return [];
  const result = await db.query<{
    n: number;
    laterMinor: number;
    snapshotDate: string | null;
    snapshotMinor: number | null;
  }>(
    `SELECT d.n::integer AS n, later.sum AS "laterMinor",
            snapshot.date AS "snapshotDate", snapshot.balance_minor AS "snapshotMinor"
     FROM unnest($1::uuid[], $2::date[]) WITH ORDINALITY AS d(account_id, date, n)
     CROSS JOIN LATERAL (
       SELECT coalesce(sum(t.amount_minor), 0)::bigint AS sum FROM "transaction" t
       WHERE t.account_id = d.account_id AND t.booking_date > d.date) later
     LEFT JOIN LATERAL (
       SELECT s.date, s.balance_minor FROM balance_snapshot s
       WHERE s.account_id = d.account_id AND s.date <= d.date
       ORDER BY s.date DESC LIMIT 1) snapshot ON true`,
    [datedAccounts.map(({ account }) => account.id), datedAccounts.map(({ date }) => date)],
  );
  const byIndex = new Map(result.rows.map((row) => [row.n - 1, row]));
  return datedAccounts.map(({ account, date }, index) => {
    const row = byIndex.get(index);
    if (!account.balanceSnapshotDate) return balanceOn(account, date, row?.laterMinor ?? 0);
    const snapshot =
      row?.snapshotDate != null && row.snapshotMinor != null
        ? { date: row.snapshotDate, balanceMinor: row.snapshotMinor }
        : undefined;
    return snapshotBalanceOn(account, date, snapshot).balanceMinor;
  });
}

/**
 * The native balance of each given Account at the end of its own date, keyed by Account id, in
 * one query for all of them. As `listAccountBalances` computes it for an Account with
 * Transactions; a snapshot-only Account's balance is its snapshot, so it is not asked here.
 */
export async function nativeBalancesOn(
  db: Queryable,
  datedAccounts: readonly DatedAccount[],
): Promise<Map<string, number>> {
  const balances = await nativeBalancesAt(db, datedAccounts);
  return new Map(datedAccounts.map(({ account }, index) => [account.id, balances[index]!]));
}

/**
 * Every Account (in `listAccounts` order) with its balance on `date` (default: today in
 * Switzerland) in its own Currency and in CHF at that date's rate (story 95). CHF values are
 * computed here, never stored (ADR-0002).
 */
export async function listAccountBalances(
  ctx: ServiceContext,
  options: { date?: string } = {},
): Promise<AccountBalance[]> {
  const input = parseInput(balancesInput, options);
  const date = input.date ?? swissToday();
  const [accounts, later, snapshots, rates] = await Promise.all([
    listAccounts(ctx),
    transactionsAfter(ctx.db, date),
    snapshotsOn(ctx.db, date),
    loadRateTable(ctx, { from: date, to: date }),
  ]);
  return accounts.map((account) => {
    const { balanceMinor, snapshotDate } = account.balanceSnapshotDate
      ? snapshotBalanceOn(account, date, snapshots.get(account.id))
      : { balanceMinor: balanceOn(account, date, later.get(account.id) ?? 0), snapshotDate: null };
    return {
      account,
      date,
      balanceMinor,
      snapshotDate,
      chf: rates.toChf(balanceMinor, account.currency, date),
    };
  });
}

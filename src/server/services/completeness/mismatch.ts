import type { Account } from '../accounts';
import { listAccountBalances } from '../accounts/balances';
import { listBalanceSnapshots } from '../balance-snapshots';
import type { ServiceContext } from '../context';

/**
 * The Account's Transactions no longer add up to its latest Statement balance (spec: Balance
 * mismatch). `differenceMinor` is computed − statement, in the Account's Currency.
 */
export interface MismatchProblem {
  kind: 'mismatch';
  differenceMinor: number;
  /** The date of the latest Statement balance the computed balance was compared with. */
  statementDate: string;
}

interface StatementBalance {
  date: string;
  balanceMinor: number;
}

/**
 * Per Account, the closing balance of its newest committed Import that states one, dated at that
 * Import's statement end (or, without one, its latest Transaction date).
 */
const SELECT_LATEST_CLOSINGS = `
  SELECT DISTINCT ON (i.account_id) i.account_id AS "accountId", e.date,
         i.closing_balance_minor AS "balanceMinor"
  FROM import i
  CROSS JOIN LATERAL (
    SELECT coalesce(
      i.statement_to,
      (SELECT max(t.booking_date) FROM "transaction" t WHERE t.import_id = i.id)
    ) AS date
  ) e
  WHERE i.undone_at IS NULL AND i.closing_balance_minor IS NOT NULL AND e.date IS NOT NULL
  ORDER BY i.account_id, e.date DESC, i.imported_at DESC`;

const SELECT_ACCOUNTS_WITH_TRANSACTIONS = `SELECT DISTINCT account_id AS "accountId" FROM "transaction"`;

/** The computed native balance of each given Account on its date, via the Account balances. */
async function computedBalances(
  ctx: ServiceContext,
  datesById: Map<string, string>,
): Promise<Map<string, number>> {
  const dates = [...new Set(datesById.values())];
  const perDate = await Promise.all(
    dates.map((date) => listAccountBalances(ctx, { date }).then((rows) => ({ date, rows }))),
  );
  const computed = new Map<string, number>();
  for (const { date, rows } of perDate) {
    for (const row of rows) {
      if (datesById.get(row.account.id) === date) computed.set(row.account.id, row.balanceMinor);
    }
  }
  return computed;
}

/**
 * The mismatch of each given Account that has Transactions, keyed by Account id. The latest
 * Statement balance is the later of the newest Import closing balance and the newest Balance
 * snapshot (the Import closing balance on a tie); an Account with neither has no mismatch.
 */
export async function findMismatches(
  ctx: ServiceContext,
  accounts: Account[],
): Promise<Map<string, MismatchProblem>> {
  const [closings, withTransactions] = await Promise.all([
    ctx.db.query<StatementBalance & { accountId: string }>(SELECT_LATEST_CLOSINGS),
    ctx.db.query<{ accountId: string }>(SELECT_ACCOUNTS_WITH_TRANSACTIONS),
  ]);
  const hasTransactions = new Set(withTransactions.rows.map((row) => row.accountId));
  const closingById = new Map(
    closings.rows.map(({ accountId, ...closing }) => [accountId, closing]),
  );
  const checked = accounts.filter((account) => hasTransactions.has(account.id));
  const latestSnapshots = await Promise.all(
    checked.map(async (account) => ({
      account,
      snapshot: (await listBalanceSnapshots(ctx, account.id))[0],
    })),
  );

  const mismatches = new Map<string, MismatchProblem>();
  const closingDates = new Map<string, string>();
  for (const { account, snapshot } of latestSnapshots) {
    const closing = closingById.get(account.id);
    if (snapshot && (!closing || snapshot.date > closing.date)) {
      if (snapshot.differenceMinor) {
        mismatches.set(account.id, {
          kind: 'mismatch',
          differenceMinor: snapshot.differenceMinor,
          statementDate: snapshot.date,
        });
      }
    } else if (closing) {
      closingDates.set(account.id, closing.date);
    }
  }

  const computed = await computedBalances(ctx, closingDates);
  for (const [accountId, date] of closingDates) {
    const differenceMinor = computed.get(accountId)! - closingById.get(accountId)!.balanceMinor;
    if (differenceMinor !== 0) {
      mismatches.set(accountId, { kind: 'mismatch', differenceMinor, statementDate: date });
    }
  }
  return mismatches;
}

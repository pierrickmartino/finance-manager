import type { Account } from '../accounts';
import { nativeBalancesOn } from '../accounts/balances';
import { listLatestBalanceSnapshots } from '../balance-snapshots';
import type { ServiceContext } from '../context';
import type { ImportCoverage } from './coverage';

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

interface Closing {
  date: string;
  balanceMinor: number;
  importedAt: Date;
}

const SELECT_ACCOUNTS_WITH_TRANSACTIONS = `SELECT DISTINCT account_id AS "accountId" FROM "transaction"`;

/**
 * The closing balance of the Account's newest committed Import that states one, dated at that
 * Import's coverage end; null when none does.
 */
function latestClosing(imports: readonly ImportCoverage[]): Closing | null {
  return imports.reduce<Closing | null>((latest, { to, closingBalanceMinor, importedAt }) => {
    if (to === null || closingBalanceMinor === null) return latest;
    const isNewer =
      latest === null || to > latest.date || (to === latest.date && importedAt > latest.importedAt);
    return isNewer ? { date: to, balanceMinor: closingBalanceMinor, importedAt } : latest;
  }, null);
}

/**
 * The mismatch of each given Account that has Transactions, keyed by Account id. The latest
 * Statement balance is the later of the newest Import closing balance and the newest Balance
 * snapshot (the Import closing balance on a tie); an Account with neither has no mismatch.
 */
export async function findMismatches(
  ctx: ServiceContext,
  accounts: readonly Account[],
  coverageById: ReadonlyMap<string, readonly ImportCoverage[]>,
): Promise<Map<string, MismatchProblem>> {
  const [withTransactions, snapshots] = await Promise.all([
    ctx.db.query<{ accountId: string }>(SELECT_ACCOUNTS_WITH_TRANSACTIONS),
    listLatestBalanceSnapshots(ctx),
  ]);
  const hasTransactions = new Set(withTransactions.rows.map((row) => row.accountId));
  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.accountId, snapshot]));
  const latest = accounts
    .filter((account) => hasTransactions.has(account.id))
    .map((account) => ({
      account,
      snapshot: snapshotById.get(account.id),
      closing: latestClosing(coverageById.get(account.id) ?? []),
    }));

  // A Balance snapshot already carries its check; it counts when dated after the closing.
  const snapshotMismatches = latest.flatMap(({ account, snapshot, closing }) =>
    snapshot?.differenceMinor && (!closing || snapshot.date > closing.date)
      ? [mismatchEntry(account, snapshot.differenceMinor, snapshot.date)]
      : [],
  );
  const closings = latest.flatMap(({ account, snapshot, closing }) =>
    closing && (!snapshot || snapshot.date <= closing.date) ? [{ account, ...closing }] : [],
  );
  const computed = await nativeBalancesOn(ctx.db, closings);
  const closingMismatches = closings.flatMap(({ account, date, balanceMinor }) => {
    const differenceMinor = computed.get(account.id)! - balanceMinor;
    return differenceMinor === 0 ? [] : [mismatchEntry(account, differenceMinor, date)];
  });
  return new Map([...snapshotMismatches, ...closingMismatches]);
}

function mismatchEntry(
  account: Account,
  differenceMinor: number,
  statementDate: string,
): [string, MismatchProblem] {
  return [account.id, { kind: 'mismatch', differenceMinor, statementDate }];
}

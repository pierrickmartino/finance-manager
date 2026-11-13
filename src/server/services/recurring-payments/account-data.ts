import { listAccounts } from '../accounts';
import { dataEndOf, loadCoverage, type DaySpan } from '../completeness/coverage';
import { findGaps } from '../completeness/gaps';
import type { ServiceContext } from '../context';

/** How far an imported Account's data reaches, as the Completeness check sees it. */
export interface AccountData {
  /** The last day its committed Imports cover; null when they cover none. */
  dataEnd: string | null;
  /** Its Gaps, oldest first. */
  gaps: DaySpan[];
}

/**
 * The data of each Account the Completeness check checks for freshness (non-archived, with an
 * Import format), by Account id. Other Accounts are absent: their Transactions are entered by
 * hand, so their data is taken to be complete.
 */
export async function loadAccountData(ctx: ServiceContext): Promise<Map<string, AccountData>> {
  const [accounts, coverageById] = await Promise.all([listAccounts(ctx), loadCoverage(ctx.db)]);
  const checked = accounts.filter(
    (account) => account.importFormat !== null && account.archivedAt === null,
  );
  const coverage = new Map(
    checked.map((account) => [account.id, coverageById.get(account.id) ?? []]),
  );
  const gapsById = await findGaps(ctx.db, coverage);
  return new Map(
    [...coverage].map(([accountId, imports]) => [
      accountId,
      { dataEnd: dataEndOf(imports), gaps: gapsById.get(accountId) ?? [] },
    ]),
  );
}

import type { ServiceContext } from '../context';

/**
 * When the data Analytics reads starts, read once per page load and shared by every section that
 * needs it. Each date is null when there is nothing of it.
 */
export interface DataStart {
  /** The first Transaction's booking date: no Span starts before it. */
  firstTransaction: string | null;
  /**
   * The first day any Account holds data, its opening date or its first Transaction: a change
   * line compares only with what this reaches back to.
   */
  accountData: string | null;
}

export async function loadDataStart(ctx: ServiceContext): Promise<DataStart> {
  const result = await ctx.db.query<{
    first_transaction: string | null;
    account_data: string | null;
  }>(
    `SELECT to_char(t.first, 'YYYY-MM-DD') AS first_transaction,
            to_char(least(a.first, t.first), 'YYYY-MM-DD') AS account_data
       FROM (SELECT min(booking_date) AS first FROM "transaction") t,
            (SELECT min(opening_date) AS first FROM account) a`,
  );
  const row = result.rows[0];
  return {
    firstTransaction: row?.first_transaction ?? null,
    accountData: row?.account_data ?? null,
  };
}

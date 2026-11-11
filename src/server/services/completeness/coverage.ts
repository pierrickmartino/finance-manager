import type { Queryable } from '../../db/client';

/** A run of days, first and last day included, as ISO dates. */
export interface DaySpan {
  from: string;
  to: string;
}

/** One committed Import of a checked Account: what it covers and the balance it closes on. */
export interface ImportCoverage {
  accountId: string;
  /** Its statement start, or else its earliest Transaction date; null when it has neither. */
  from: string | null;
  /** Its statement end, or else its latest Transaction date; null when it covers nothing. */
  to: string | null;
  closingBalanceMinor: number | null;
  importedAt: Date;
}

/**
 * Each committed Import of a non-archived Account with an Import format, with its coverage: its
 * statement period, a missing start or end falling back to that Import's earliest or latest
 * Transaction date. Undone Imports cover nothing, so they are left out.
 */
const SELECT_COVERAGE = `
  SELECT i.account_id AS "accountId",
         coalesce(i.statement_from, t.first) AS "from",
         coalesce(i.statement_to, t.last) AS "to",
         i.closing_balance_minor AS "closingBalanceMinor",
         i.imported_at AS "importedAt"
  FROM import i
  JOIN account a ON a.id = i.account_id
  CROSS JOIN LATERAL (
    SELECT min(booking_date) AS first, max(booking_date) AS last
    FROM "transaction" WHERE import_id = i.id
  ) t
  WHERE i.undone_at IS NULL AND a.archived_at IS NULL AND a.import_format IS NOT NULL`;

/** The committed Imports of every checked Account, grouped by Account id. */
export async function loadCoverage(db: Queryable): Promise<Map<string, ImportCoverage[]>> {
  const result = await db.query<ImportCoverage>(SELECT_COVERAGE);
  return Map.groupBy(result.rows, (row) => row.accountId);
}

/** The data end of an Account's Imports: the last day any of them covers; null if none covers any. */
export function dataEndOf(imports: readonly ImportCoverage[]): string | null {
  return imports.reduce<string | null>(
    (end, { to }) => (to !== null && (end === null || to > end) ? to : end),
    null,
  );
}

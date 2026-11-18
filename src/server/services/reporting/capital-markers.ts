import type { ServiceContext } from '../context';
import { currenciesInUse } from './engine';
import type { DateSpan } from './periods';
import type { WidgetQuery } from './query';
import { baseCte, SqlParams } from './sql';

/**
 * A Capital movement on the Net worth line (GLOSSARY: Capital): a Transaction, or one Split
 * line of it, classified under a Capital Category. It only annotates the line, whose balances
 * already hold it.
 */
export interface CapitalMarker {
  transactionId: string;
  /** The Split line's id; null for a whole Transaction. */
  lineId: string | null;
  /** Its booking date. */
  date: string;
  /** CHF minor units at the booking date's FX rate (ADR-0002); null with no rate yet. */
  amountMinor: number | null;
  /** Its Payee's name, else its Category's. */
  label: string;
}

interface MarkerRow {
  id: string;
  line_id: string | null;
  booking_date: string;
  chf_minor: string | null;
  label: string;
}

/**
 * Every Capital Transaction and Capital Split line booked in `range` on one of `accountIds`,
 * oldest first. Transfers are never Capital movements: the reporting rows leave them out.
 */
export async function listCapitalMarkers(
  ctx: ServiceContext,
  accountIds: readonly string[],
  range: DateSpan,
): Promise<CapitalMarker[]> {
  if (accountIds.length === 0 || range.from > range.to) return [];
  const query: WidgetQuery = {
    dateRange: { kind: 'fixed', from: range.from, to: range.to },
    rows: null,
    columns: null,
    measure: 'sum',
    averagePer: 'month',
    filters: { accountIds: [...accountIds], categoryGroupTypes: ['capital'] },
    includeCapital: true,
  };
  const params = new SqlParams();
  const cte = baseCte(query, range, await currenciesInUse(ctx), params);
  const result = await ctx.db.query<MarkerRow>(
    `${cte}
     SELECT b.id, b.line_id, to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date,
       b.chf_minor::text AS chf_minor, coalesce(p.name, c.name) AS label
     FROM report_base b
     LEFT JOIN payee p ON p.id = b.payee_id
     LEFT JOIN category c ON c.id = b.category_id
     ORDER BY b.booking_date, b.id, b.line_id`,
    params.values,
  );
  return result.rows.map((row) => ({
    transactionId: row.id,
    lineId: row.line_id,
    date: row.booking_date,
    amountMinor: row.chf_minor === null ? null : Number(row.chf_minor),
    label: row.label,
  }));
}

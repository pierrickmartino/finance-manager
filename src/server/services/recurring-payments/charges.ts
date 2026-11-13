import type { Queryable } from '@/server/db/client';
import { REPORTED_PAYEE_ID } from '../transactions/line-payee';

/** What a charge is: a whole unsplit Transaction, or one Split line (ADR-0011). */
export type ChargeKind = 'transaction' | 'splitLine';

/** One charge of a Recurring payment, as the series references it. */
export interface Charge {
  kind: ChargeKind;
  /** The Transaction's id, or the Split line's for a line. */
  id: string;
  /** The Transaction it is, or belongs to. */
  transactionId: string;
  accountId: string;
  bookingDate: string;
  /** What was paid, in minor units of the charge's Currency: positive. */
  amountMinor: number;
}

/** A charge with what groups it: its Payee and Currency. */
export interface LoadedCharge extends Charge {
  payeeId: string;
  payeeName: string;
  currency: string;
}

/**
 * The charges booked from `from` to `to` (inclusive), oldest first: unsplit Transactions and
 * Split lines classified under a Category of an Expense Category group, with a reported Payee
 * (a line's own, else its Transaction's), that are not Transfers. A split Transaction is never a
 * charge as a whole, only its lines are. Only money out counts: a refund booked under an Expense
 * Category is not a charge.
 */
export async function loadCharges(
  db: Queryable,
  range: { from: string; to: string },
): Promise<LoadedCharge[]> {
  const result = await db.query<LoadedCharge>(
    `SELECT CASE WHEN sl.id IS NULL THEN 'transaction' ELSE 'splitLine' END AS kind,
       coalesce(sl.id, t.id) AS id, t.id AS "transactionId", t.account_id AS "accountId",
       t.booking_date AS "bookingDate", -coalesce(sl.amount_minor, t.amount_minor) AS "amountMinor",
       t.currency::text AS currency, p.id AS "payeeId", p.name AS "payeeName"
     FROM "transaction" t
     LEFT JOIN split_line sl ON sl.transaction_id = t.id
     JOIN category c ON c.id = coalesce(sl.category_id, t.category_id)
     JOIN category_group g ON g.id = c.group_id
     JOIN payee p ON p.id = ${REPORTED_PAYEE_ID}
     WHERE g.type = 'expense'
       AND t.transfer_id IS NULL
       AND sl.transfer_id IS NULL
       AND coalesce(sl.amount_minor, t.amount_minor) < 0
       AND t.booking_date BETWEEN $1::date AND $2::date
     ORDER BY t.booking_date, t.entry_order, sl.position`,
    [range.from, range.to],
  );
  return result.rows;
}

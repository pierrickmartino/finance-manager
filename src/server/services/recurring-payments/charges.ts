import type { Queryable } from '@/server/db/client';

/** What a charge is: a whole Transaction (a Split line later, ADR-0011). */
export type ChargeKind = 'transaction';

/** One charge of a Recurring payment, as the series references it. */
export interface Charge {
  kind: ChargeKind;
  /** The Transaction's id (for a Split line, the line's). */
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
 * The charges booked from `from` to `to` (inclusive), oldest first: whole Transactions classified
 * under a Category of an Expense Category group, with a Payee, that are not Transfers. Only money
 * out counts: a refund booked under an Expense Category is not a charge.
 */
export async function loadCharges(
  db: Queryable,
  range: { from: string; to: string },
): Promise<LoadedCharge[]> {
  const result = await db.query<LoadedCharge>(
    `SELECT 'transaction' AS kind, t.id, t.id AS "transactionId", t.account_id AS "accountId",
       t.booking_date AS "bookingDate", -t.amount_minor AS "amountMinor",
       t.currency::text AS currency, p.id AS "payeeId", p.name AS "payeeName"
     FROM "transaction" t
     JOIN category c ON c.id = t.category_id
     JOIN category_group g ON g.id = c.group_id
     JOIN payee p ON p.id = t.payee_id
     WHERE g.type = 'expense'
       AND t.transfer_id IS NULL
       AND t.amount_minor < 0
       AND t.booking_date BETWEEN $1::date AND $2::date
     ORDER BY t.booking_date, t.entry_order`,
    [range.from, range.to],
  );
  return result.rows;
}

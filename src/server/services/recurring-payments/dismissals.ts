import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { mutate, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import type { HistorySnapshot } from '../history/recorder';
import { REPORTED_PAYEE_ID } from '../transactions/line-payee';
import type { ChargeKind } from './charges';
import type { ChargeRef } from './drill';

/** Names one charge a dismissal is anchored on: a whole Transaction or a Split line. */
interface KnownChargeRef {
  kind: ChargeKind;
  id: string;
}

/** A stored dismissal (ADR-0011): only its id, the charges it is anchored on are internal. */
export interface RecurringPaymentDismissal {
  id: string;
}

const HISTORY_TYPE = 'recurring_payment_dismissal';

/** More charges than 36 months of weekly payments: a bound on untrusted input, not a rule. */
const MAX_CHARGES = 500;

const chargeRef = z.object({
  kind: z.enum(['transaction', 'splitLine'], { error: 'Unknown charge kind' }),
  id: z.uuid({ error: 'A charge must be a Transaction or Split line id' }),
});

const dismissInput = z.object({
  charges: z
    .array(chargeRef)
    .min(1, { error: 'A Recurring payment to dismiss needs its charges' })
    .max(MAX_CHARGES, { error: 'Too many charges' }),
});

const dismissalId = z.uuid();

const refKey = (ref: ChargeRef): string => `${ref.kind}:${ref.id}`;

function uniqueRefs(refs: readonly KnownChargeRef[]): KnownChargeRef[] {
  const byKey = new Map(refs.map((ref) => [refKey(ref), { kind: ref.kind, id: ref.id }]));
  return [...byKey.values()];
}

interface ExistingCharge extends KnownChargeRef {
  payeeName: string | null;
}

/** The given charges that exist, with their reported Payee's name. */
async function findCharges(
  db: Queryable,
  refs: readonly KnownChargeRef[],
): Promise<ExistingCharge[]> {
  const ids = (kind: ChargeKind) => refs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
  const result = await db.query<ExistingCharge>(
    `SELECT 'transaction' AS kind, t.id, p.name AS "payeeName"
     FROM "transaction" t LEFT JOIN payee p ON p.id = t.payee_id
     WHERE t.id = ANY($1::uuid[])
     UNION ALL
     SELECT 'splitLine' AS kind, sl.id, p.name AS "payeeName"
     FROM split_line sl JOIN "transaction" t ON t.id = sl.transaction_id
     LEFT JOIN payee p ON p.id = ${REPORTED_PAYEE_ID}
     WHERE sl.id = ANY($2::uuid[])`,
    [ids('transaction'), ids('splitLine')],
  );
  return result.rows;
}

/** What History shows of a dismissal: the Payee it was for and the charges it holds. */
function snapshot(charges: readonly ExistingCharge[]): HistorySnapshot {
  const payees = [...new Set(charges.map((charge) => charge.payeeName).filter(Boolean))];
  return {
    payee: payees.toSorted().join(', ') || null,
    charges: charges.map(refKey).toSorted(),
  };
}

/** The charges a dismissal is anchored on, with their Payee, or null when it does not exist. */
async function loadDismissalCharges(db: Queryable, id: string): Promise<ExistingCharge[] | null> {
  const found = await db.query(
    'SELECT 1 FROM recurring_payment_dismissal WHERE id = $1 FOR UPDATE',
    [id],
  );
  if (found.rowCount === 0) return null;
  const refs = await db.query<KnownChargeRef>(
    `SELECT CASE WHEN transaction_id IS NULL THEN 'splitLine' ELSE 'transaction' END AS kind,
       coalesce(transaction_id, split_line_id) AS id
     FROM recurring_payment_dismissal_charge WHERE dismissal_id = $1`,
    [id],
  );
  return findCharges(db, refs.rows);
}

/**
 * Dismisses a Recurring payment as a false positive (spec: Recurring payments; ADR-0011): stores
 * a dismissal anchored on its charges, so any series containing one of them is dismissed. Every
 * charge must exist.
 */
export async function dismissRecurringPayment(
  ctx: ServiceContext,
  input: { charges: readonly ChargeRef[] },
): Promise<RecurringPaymentDismissal> {
  const refs = uniqueRefs(parseInput(dismissInput, input).charges);
  return mutate(ctx, async ({ tx, history }) => {
    const charges = await findCharges(tx, refs);
    if (charges.length !== refs.length) {
      throw new ValidationError('Some of these charges no longer exist: reload the page');
    }
    const created = await tx.query<{ id: string }>(
      'INSERT INTO recurring_payment_dismissal DEFAULT VALUES RETURNING id',
    );
    const id = created.rows[0]!.id;
    const ids = (kind: ChargeKind) =>
      charges.filter((one) => one.kind === kind).map((one) => one.id);
    await tx.query(
      `INSERT INTO recurring_payment_dismissal_charge (dismissal_id, transaction_id, split_line_id)
       SELECT $1::uuid, unnest($2::uuid[]), NULL::uuid
       UNION ALL
       SELECT $1::uuid, NULL::uuid, unnest($3::uuid[])`,
      [id, ids('transaction'), ids('splitLine')],
    );
    await history.record(HISTORY_TYPE, id, null, snapshot(charges));
    return { id };
  });
}

/** Restores a dismissed Recurring payment: deletes its dismissal, so the series shows again. */
export async function restoreRecurringPayment(ctx: ServiceContext, id: string): Promise<void> {
  if (!dismissalId.safeParse(id).success) throw new NotFoundError('Dismissal not found');
  await mutate(ctx, async ({ tx, history }) => {
    const charges = await loadDismissalCharges(tx, id);
    if (!charges) throw new NotFoundError('Dismissal not found');
    await tx.query('DELETE FROM recurring_payment_dismissal WHERE id = $1', [id]);
    await history.record(HISTORY_TYPE, id, snapshot(charges), null);
  });
}

/** Every stored dismissal's charges, keyed `kind:id`, to the dismissal holding them. */
export async function loadDismissedCharges(db: Queryable): Promise<Map<string, string>> {
  const result = await db.query<{ key: string; dismissalId: string }>(
    `SELECT CASE WHEN transaction_id IS NULL THEN 'splitLine:' || split_line_id
                 ELSE 'transaction:' || transaction_id END AS key,
       dismissal_id AS "dismissalId"
     FROM recurring_payment_dismissal_charge
     ORDER BY dismissal_id`,
  );
  return new Map(result.rows.map((row) => [row.key, row.dismissalId]));
}

/** The dismissal holding any of `charges`, or null. */
export function dismissalOf(
  dismissed: ReadonlyMap<string, string>,
  charges: readonly ChargeRef[],
): string | null {
  for (const charge of charges) {
    const id = dismissed.get(refKey(charge));
    if (id) return id;
  }
  return null;
}

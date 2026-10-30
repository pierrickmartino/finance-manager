import type { HistorySnapshot } from '../history';
import type { BundledDetail } from '../imports/parsers';

/** One Transaction as services return it. Amounts are minor units of `currency` (ADR-0002). */
export interface Transaction {
  id: string;
  accountId: string;
  /** The Import that brought it in; null for a Manual transaction. */
  importId: string | null;
  isManual: boolean;
  bookingDate: string;
  valueDate: string | null;
  amountMinor: number;
  currency: string;
  fingerprint: string | null;
  bankReference: string | null;
  rawDescription: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  paymentReference: string | null;
  bundledDetails: BundledDetail[] | null;
  notes: string | null;
  lockedFields: string[];
}

/** `${SELECT_TRANSACTION} WHERE ...`: every Transaction column, camelCase, from alias `t`. */
export const SELECT_TRANSACTION = `
  SELECT t.id, t.account_id AS "accountId", t.import_id AS "importId", t.is_manual AS "isManual",
         t.booking_date AS "bookingDate", t.value_date AS "valueDate",
         t.amount_minor AS "amountMinor", t.currency, t.fingerprint,
         t.bank_reference AS "bankReference", t.raw_description AS "rawDescription",
         t.counterparty_name AS "counterpartyName", t.counterparty_iban AS "counterpartyIban",
         t.payment_reference AS "paymentReference", t.bundled_details AS "bundledDetails",
         t.notes, t.locked_fields AS "lockedFields"
  FROM "transaction" t`;

/** Sort order of Transactions: by booking date, then in the order they were written. */
export const TRANSACTION_ORDER = 't.booking_date, t.entry_order';

/** What History records about a Transaction (everything but the id). */
export function transactionSnapshot(transaction: Transaction): HistorySnapshot {
  const { id: _id, bundledDetails, ...fields } = transaction;
  return {
    ...fields,
    bundledDetails: bundledDetails ? bundledDetails.map((detail) => ({ ...detail })) : null,
  };
}

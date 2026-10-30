import { ValidationError } from '../errors';
import type { Transaction } from './model';

/**
 * The fields an imported Transaction takes from the bank file, with the names the user sees.
 * They are read-only (spec 35); the `transaction_bank_fields_immutable` trigger enforces the
 * same list in the database.
 */
export const BANK_FIELD_LABELS = {
  accountId: 'Account',
  importId: 'Import',
  isManual: 'manual flag',
  bookingDate: 'booking date',
  valueDate: 'value date',
  amountMinor: 'amount',
  currency: 'Currency',
  fingerprint: 'Fingerprint',
  bankReference: 'bank reference',
  rawDescription: 'original text',
  counterpartyName: 'counterparty',
  counterpartyIban: 'counterparty IBAN',
  paymentReference: 'payment reference',
  bundledDetails: 'bundled details',
} as const satisfies Partial<Record<keyof Transaction, string>>;

export type BankField = keyof typeof BANK_FIELD_LABELS;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Throws a ValidationError when `changes` would alter a bank field of an imported Transaction.
 * Fields given with their current value are not changes. Manual transactions pass. Every
 * operation that edits a Transaction calls this before writing.
 */
export function refuseBankFieldChanges(
  transaction: Transaction,
  changes: Partial<Transaction>,
): void {
  if (transaction.isManual) return;
  const changed = (Object.keys(BANK_FIELD_LABELS) as BankField[]).filter(
    (field) => field in changes && !sameValue(changes[field], transaction[field]),
  );
  if (changed.length === 0) return;
  const labels = changed.map((field) => BANK_FIELD_LABELS[field]).join(', ');
  throw new ValidationError(
    `The bank fields of an imported Transaction can't be edited (${labels})`,
  );
}

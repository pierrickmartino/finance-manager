import type { ImportFormat } from '../../accounts';

/** One payment detail of a bank entry that bundles several (CAMT `TxDtls`). Shown for information. */
export interface BundledDetail {
  amountMinor: number | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  paymentReference: string | null;
}

/**
 * One booked entry of a bank file, normalised. Parsers return booked entries only (spec 25):
 * pending ones are dropped by the parser.
 */
export interface ParsedEntry {
  /** ISO date. The Transaction date in every format (spec 37). */
  bookingDate: string;
  valueDate: string | null;
  /** Signed (debit negative), integer minor units of `currency`. */
  amountMinor: number;
  currency: string;
  /** The bank's own reference (`No de transaction`, `AcctSvcrRef`, `FITID`); null when absent. */
  bankReference: string | null;
  /** The bank's text, kept whole so it can be searched and matched by Rules. Never empty for hashing. */
  rawDescription: string;
  counterpartyName: string | null;
  /** Normalised: no spaces, upper case. */
  counterpartyIban: string | null;
  paymentReference: string | null;
  /** Null unless the bank bundled several payment details into this entry. */
  bundledDetails: BundledDetail[] | null;
  /** The balance after this entry, when the format has one (UBS `Solde`). */
  runningBalanceMinor: number | null;
}

/** The bank's own account identifiers, for formats without an IBAN (OFX `BANKACCTFROM`). */
export interface BankAccountId {
  bankId: string | null;
  branchId: string | null;
  accountId: string | null;
}

/** What a parser makes of a whole file. All amounts are integer minor units of `currency`. */
export interface ParsedStatement {
  /** The Account's IBAN as the file states it, normalised; null when the file has none (OFX). */
  iban: string | null;
  /** Set by formats that identify the account without an IBAN (OFX); absent otherwise. */
  bankAccount?: BankAccountId | null;
  currency: string;
  /** Statement period, ISO dates; null when the file doesn't say. */
  from: string | null;
  to: string | null;
  /** Statement balances. Either may be null (OFX has a closing balance only). */
  openingBalanceMinor: number | null;
  closingBalanceMinor: number | null;
  /** Oldest first. Entries booked on the same day keep the bank's order. */
  entries: ParsedEntry[];
}

/**
 * Turns the bytes of one bank file into a statement. Pure: no I/O, no clock, no database.
 * Throws `UnreadableFileError` when the file isn't in this format, or is damaged.
 */
export interface ImportParser {
  readonly format: ImportFormat;
  parse(content: Uint8Array): ParsedStatement;
}

/**
 * The file can't be read as the expected format. The message says what is wrong (in the
 * user's terms); the pipeline prefixes it with the format's name.
 */
export class UnreadableFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableFileError';
  }
}

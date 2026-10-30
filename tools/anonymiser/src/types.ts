export const FORMATS = ['ubs-csv', 'camt053', 'ofx'] as const;
export type Format = (typeof FORMATS)[number];

/** One movement as read back from a bank file. Amounts are signed minor units. */
export interface StatementEntry {
  readonly bookingDate: string;
  readonly amount: number;
  readonly runningBalance?: number;
  /** CAMT `Sts`; other formats only carry booked entries. */
  readonly status?: string;
}

/**
 * The money facts of a bank file: what must survive anonymisation unchanged.
 * Balances are minor units; absent when the format does not carry them.
 */
export interface Statement {
  readonly currency: string;
  readonly openingBalance?: number;
  readonly closingBalance?: number;
  readonly entries: readonly StatementEntry[];
}

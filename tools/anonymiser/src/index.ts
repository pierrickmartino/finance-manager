import { anonymiseCamt053, readCamt053 } from './camt053.ts';
import { Faker } from './faker.ts';
import { anonymiseOfx, readOfx } from './ofx.ts';
import { anonymiseUbsCsv, readUbsCsv } from './ubs-csv.ts';
import type { Format, Statement } from './types.ts';

export type { Format, Statement, StatementEntry } from './types.ts';
export { FORMATS } from './types.ts';
export { reconciles } from './reconcile.ts';
export { isValidIban } from './faker.ts';

interface FormatHandler {
  readonly read: (input: Buffer) => Statement;
  readonly anonymise: (input: Buffer, faker: Faker) => Buffer;
}

const HANDLERS: Readonly<Record<Format, FormatHandler>> = {
  'ubs-csv': { read: readUbsCsv, anonymise: anonymiseUbsCsv },
  camt053: { read: readCamt053, anonymise: anonymiseCamt053 },
  ofx: { read: readOfx, anonymise: anonymiseOfx },
};

/** Recognises the format from the file's content, or `undefined` when it is none of ours. */
export function detectFormat(input: Buffer): Format | undefined {
  const head = input.subarray(0, 4096).toString('latin1');
  if (/^\s*OFXHEADER:/.test(head)) return 'ofx';
  if (head.includes('camt.053')) return 'camt053';
  if (input.subarray(0, 8192).toString('utf8').includes('Date de comptabilisation')) return 'ubs-csv';
  return undefined;
}

/** Parses a bank file back into its money facts; throws when the structure is invalid. */
export function readStatement(format: Format, input: Buffer): Statement {
  return HANDLERS[format].read(input);
}

/**
 * Rewrites a bank file with personal data replaced by deterministic fakes derived from `seed`.
 * Layout, encoding, line endings, dates, amounts and balances are kept byte for byte.
 */
export function anonymise(format: Format, input: Buffer, seed: string): Buffer {
  return HANDLERS[format].anonymise(input, new Faker(seed));
}

import type { ImportFormat } from '../../accounts';
import { camt053Parser } from './camt053';
import type { ImportParser } from './types';
import { ubsCsvParser } from './ubs-csv';

export type { BundledDetail, ImportParser, ParsedEntry, ParsedStatement } from './types';
export { UnreadableFileError } from './types';

/**
 * The parser registry: one parser per Import format. A format without a parser yet can be
 * chosen on an Account but not imported. Each parser ticket adds one line here.
 */
const PARSERS: Partial<Record<ImportFormat, ImportParser>> = {
  ubs_csv: ubsCsvParser,
  camt053: camt053Parser,
};

export function parserFor(format: ImportFormat): ImportParser | null {
  return PARSERS[format] ?? null;
}

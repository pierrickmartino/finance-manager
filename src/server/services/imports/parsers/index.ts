import type { ImportFormat } from '../../accounts';
import type { ImportParser } from './types';
import { ofxParser } from './ofx';
import { ubsCsvParser } from './ubs-csv';

export type {
  BankAccountId,
  BundledDetail,
  ImportParser,
  ParsedEntry,
  ParsedStatement,
} from './types';
export { UnreadableFileError } from './types';

/**
 * The parser registry: one parser per Import format. A format without a parser yet can be
 * chosen on an Account but not imported. Each parser ticket adds one line here.
 */
const PARSERS: Partial<Record<ImportFormat, ImportParser>> = {
  ubs_csv: ubsCsvParser,
  ofx: ofxParser,
};

export function parserFor(format: ImportFormat): ImportParser | null {
  return PARSERS[format] ?? null;
}

/**
 * A lossless CSV tokenizer: parse then serialize returns the exact input text,
 * so only the field values we deliberately change differ in the output.
 */

export interface CsvField {
  readonly value: string;
  readonly quoted: boolean;
}

export interface CsvRecord {
  readonly fields: readonly CsvField[];
  /** The line terminator that ended this record (`\r\n`, `\n`, `\r` or `` at end of file). */
  readonly eol: string;
}

export function parseCsv(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: CsvField[] = [];
  let value = '';
  let quoted = false;
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    fields.push({ value, quoted });
    value = '';
    quoted = false;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i += 2;
        continue;
      }
      if (ch === '"') inQuotes = false;
      else value += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && value === '') {
      inQuotes = true;
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      const eol = ch === '\r' && text[i + 1] === '\n' ? '\r\n' : ch;
      endField();
      records.push({ fields, eol });
      fields = [];
      i += eol.length;
      continue;
    }
    value += ch;
    i += 1;
  }
  if (inQuotes) throw new Error('Unterminated quoted CSV field');
  if (value !== '' || quoted || fields.length > 0) {
    endField();
    records.push({ fields, eol: '' });
  }
  return records;
}

export function serializeCsv(records: readonly CsvRecord[], delimiter: string): string {
  return records
    .map((record) => {
      const line = record.fields
        .map((f) => (f.quoted ? `"${f.value.replace(/"/g, '""')}"` : f.value))
        .join(delimiter);
      return line + record.eol;
    })
    .join('');
}

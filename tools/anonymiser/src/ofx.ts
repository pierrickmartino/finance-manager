import iconv from 'iconv-lite';
import type { Faker } from './faker.ts';
import { parseMinor } from './money.ts';
import type { Statement, StatementEntry } from './types.ts';

/** OFX 1.02 SGML files are Windows-1252; every fake we produce is encodable in it. */
const ENCODING = 'win1252';

/**
 * Leaf tags whose values are kept: codes, dates, amounts, currency and the bank code.
 * Every other leaf value (ACCTID, BRANCHID, FITID, NAME, MEMO, ...) is anonymised.
 */
const KEPT_TAGS = new Set([
  'CODE', 'SEVERITY', 'DTSERVER', 'LANGUAGE', 'DTPROFUP', 'DTACCTUP',
  'CURDEF', 'BANKID', 'ACCTTYPE',
  'DTSTART', 'DTEND', 'TRNTYPE', 'DTPOSTED', 'DTUSER', 'DTAVAIL', 'TRNAMT',
  'BALAMT', 'DTASOF',
]);

/** Either a whole transaction (so NAME and MEMO are seen together) or one leaf tag and its value. */
const BLOCK_OR_LEAF = /<STMTTRN>[\s\S]*?<\/STMTTRN>|<([A-Z0-9.]+)>([^<\r\n]+)/g;
const LEAF = /<([A-Z0-9.]+)>([^<\r\n]+)/g;
const ENTITY = /(&(?:#\d+|#x[\da-f]+|\w+);)/i;

/** Anonymises a value but leaves SGML entities such as `&amp;` intact. */
const fakeValue = (value: string, faker: Faker): string =>
  value
    .split(ENTITY)
    .map((part, i) => (i % 2 === 1 ? part : faker.text(part)))
    .join('');

const leafValue = (block: string, tag: string): string | undefined =>
  new RegExp(`<${tag}>([^<\\r\\n]*)`).exec(block)?.[1];

function anonymiseTransaction(block: string, faker: Faker): string {
  const name = leafValue(block, 'NAME');
  const memo = leafValue(block, 'MEMO');
  const fakeMemo = memo === undefined ? undefined : fakeValue(memo, faker);
  // NAME is often MEMO truncated to 32 characters: keep that relation in the fakes.
  const fakeName =
    name !== undefined && memo !== undefined && fakeMemo !== undefined && memo.startsWith(name)
      ? fakeMemo.slice(0, name.length)
      : undefined;

  return block.replace(LEAF, (whole, tag: string, value: string) => {
    if (KEPT_TAGS.has(tag)) return whole;
    if (tag === 'MEMO' && fakeMemo !== undefined) return `<${tag}>${fakeMemo}`;
    if (tag === 'NAME' && fakeName !== undefined) return `<${tag}>${fakeName}`;
    return `<${tag}>${fakeValue(value, faker)}`;
  });
}

export function anonymiseOfx(input: Buffer, faker: Faker): Buffer {
  const sgml = iconv.decode(input, ENCODING);
  const output = sgml.replace(BLOCK_OR_LEAF, (whole, tag: string | undefined, value: string | undefined) => {
    if (tag === undefined || value === undefined) return anonymiseTransaction(whole, faker);
    return KEPT_TAGS.has(tag) ? whole : `<${tag}>${fakeValue(value, faker)}`;
  });
  return iconv.encode(output, ENCODING);
}

const ofxDate = (raw: string): string => {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!match) throw new Error(`OFX: invalid date "${raw}"`);
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const required = (block: string, tag: string): string => {
  const value = leafValue(block, tag);
  if (value === undefined || value.trim() === '') throw new Error(`OFX: missing <${tag}>`);
  return value.trim();
};

export function readOfx(input: Buffer): Statement {
  const sgml = iconv.decode(input, ENCODING);
  if (!sgml.trimStart().startsWith('OFXHEADER:')) throw new Error('OFX: missing OFXHEADER');
  if (!/<OFX>[\s\S]*<\/OFX>/.test(sgml)) throw new Error('OFX: missing <OFX> body');

  const entries: StatementEntry[] = [...sgml.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g)].map(([, block = '']) => ({
    bookingDate: ofxDate(required(block, 'DTPOSTED')),
    amount: parseMinor(required(block, 'TRNAMT')),
  }));
  const ledger = /<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/.exec(sgml)?.[1];

  return {
    currency: required(sgml, 'CURDEF'),
    ...(ledger === undefined ? {} : { closingBalance: parseMinor(required(ledger, 'BALAMT')) }),
    entries,
  };
}

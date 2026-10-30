import { describe, expect, test } from 'vitest';
import { anonymise, readStatement } from '../src/index.ts';
import { readInput, SEED } from './helpers.ts';

const INPUT = 'credit-agricole.ofx';
const latin1 = (b: Buffer): string => b.toString('latin1');

describe('OFX 1.02 SGML', () => {
  test('reads the currency, closing balance and entries', () => {
    const statement = readStatement('ofx', readInput(INPUT));

    expect(statement).toEqual({
      currency: 'EUR',
      closingBalance: 287543,
      entries: [
        { bookingDate: '2025-10-03', amount: -4250 },
        { bookingDate: '2025-10-12', amount: 150000 },
        { bookingDate: '2025-10-20', amount: -2380 },
        { bookingDate: '2025-10-25', amount: 2380 },
      ],
    });
  });

  test('rejects a file without an OFX header', () => {
    expect(() => readStatement('ofx', Buffer.from('<OFX></OFX>'))).toThrow();
  });

  test('keeps amounts, dates and the closing balance', () => {
    const input = readInput(INPUT);
    expect(readStatement('ofx', anonymise('ofx', input, SEED))).toEqual(readStatement('ofx', input));
  });

  test('keeps Windows-1252 encoding, CRLF line endings, the header and the tag layout', () => {
    const input = readInput(INPUT);
    const output = anonymise('ofx', input, SEED);

    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(output)).toThrow();
    expect(output.includes(Buffer.from('Ã'))).toBe(false); // no UTF-8 double encoding
    expect(output.length).toBe(input.length);
    const lines = (b: Buffer): string[] => latin1(b).split('\r\n');
    expect(lines(output)).toHaveLength(lines(input).length);
    expect(lines(output).map((l) => /^(<[^>]+>)?/.exec(l)![0])).toEqual(lines(input).map((l) => /^(<[^>]+>)?/.exec(l)![0]));
    expect(latin1(output)).toContain('CHARSET:1252\r\n');
    expect(latin1(output)).toContain('<BANKID>18206\r\n');
    expect(latin1(output)).toContain('<TRNTYPE>OTHER\r\n');
  });

  test('is deterministic for a seed', () => {
    const input = readInput(INPUT);
    expect(anonymise('ofx', input, SEED).equals(anonymise('ofx', input, SEED))).toBe(true);
    expect(anonymise('ofx', input, SEED).equals(anonymise('ofx', input, 'other'))).toBe(false);
  });

  test('keeps the truncated NAME a prefix of the matching MEMO', () => {
    const text = latin1(anonymise('ofx', readInput(INPUT), SEED));
    const names = [...text.matchAll(/<NAME>([^\r\n]*)/g)].map((m) => m[1]!);
    const memos = [...text.matchAll(/<MEMO>([^\r\n]*)/g)].map((m) => m[1]!);

    expect(names).toHaveLength(4);
    names.forEach((name, i) => expect(memos[i]!.startsWith(name), name).toBe(true));
    expect(names[2]).toHaveLength(32);
  });

  test('removes every name, account number, reference and payment text', () => {
    const text = latin1(anonymise('ofx', readInput(INPUT), SEED));

    for (const sensitive of [
      '12345678901',
      '3K7Q2025100300001',
      '3K7Q2025102500004',
      'Zéphyr',
      'Électricité',
      '998877',
      'Quillfeather',
      'Aurélien',
      'CH9300762011623852957',
      'Épargne',
      'BOULANGERIE',
      'CRÈME BRÛLÉE',
      'KWAZULU',
      'X4821',
    ]) {
      expect(text, sensitive).not.toContain(sensitive);
    }
  });
});

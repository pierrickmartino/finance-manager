import { describe, expect, test } from 'vitest';
import { anonymise, isValidIban, readStatement, reconciles } from '../src/index.ts';
import { readInput, SEED } from './helpers.ts';

describe('UBS CSV', () => {
  test('reads balances and movements from a UBS export', () => {
    const statement = readStatement('ubs-csv', readInput('ubs.csv'));

    expect(statement.currency).toBe('CHF');
    expect(statement.openingBalance).toBe(100000);
    expect(statement.closingBalance).toBe(411065);
    expect(statement.entries.map((e) => [e.bookingDate, e.amount, e.runningBalance])).toEqual([
      ['2025-03-31', -500, 411065],
      ['2025-03-28', -150000, 411565],
      ['2025-03-20', -30000, 561565],
      ['2025-03-18', 1990, 591565],
      ['2025-03-15', -10425, 589575],
      ['2025-03-05', 500000, 600000],
    ]);
  });

  test('keeps amounts, dates and balances, and still reconciles', () => {
    const input = readInput('ubs.csv');
    const output = anonymise('ubs-csv', input, SEED);

    const statement = readStatement('ubs-csv', output);
    expect(statement).toEqual(readStatement('ubs-csv', input));
    expect(reconciles(statement)).toBe(true);
  });

  test('keeps the UTF-8 BOM, CRLF line endings and layout', () => {
    const input = readInput('ubs.csv');
    const output = anonymise('ubs-csv', input, SEED);

    expect([...output.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(output)).toContain('\r\n');
    expect(output.toString('utf8').split('\r\n').map((l) => l.split(';').length)).toEqual(
      input.toString('utf8').split('\r\n').map((l) => l.split(';').length),
    );
    expect(output.toString('utf8')).toContain('Motif du paiement: ');
  });

  test('is deterministic for a seed and differs across seeds', () => {
    const input = readInput('ubs.csv');

    expect(anonymise('ubs-csv', input, SEED).equals(anonymise('ubs-csv', input, SEED))).toBe(true);
    expect(anonymise('ubs-csv', input, SEED).equals(anonymise('ubs-csv', input, 'other'))).toBe(false);
  });

  test('maps the same counterparty IBAN and reference to the same valid fakes', () => {
    const output = anonymise('ubs-csv', readInput('ubs.csv'), SEED).toString('utf8');

    const ibans = [...output.matchAll(/No de compte: (CH\d{19})/g)].map((m) => m[1]!);
    expect(ibans).toHaveLength(4);
    expect(new Set(ibans).size).toBe(3);
    expect(ibans.every(isValidIban)).toBe(true);
    const ownIban = /IBAN:;([^;]+);/.exec(output)![1]!;
    expect(ownIban).toMatch(/^CH\d{2} 0024 \d{4} \d{4} \d{4} \d$/);
    expect(isValidIban(ownIban)).toBe(true);

    const rows = output.split('\r\n').filter((l) => l.startsWith('2025-03-28'));
    const [, reference] = /;-1500\.00;;;4115\.65;([^;]+);/.exec(rows[0]!)!;
    expect(rows[0]).toContain(`No de transaction: ${reference}"`);
  });

  test('removes every name, address, account number, reference and payment text', () => {
    const output = anonymise('ubs-csv', readInput('ubs.csv'), SEED).toString('utf8');

    for (const sensitive of [
      '0240 00240189.01T',
      'CH78 0024 0024 0189 0123 4',
      'CH9100788000050812345',
      'CH3600483000012345678',
      'CH9300762011623852957',
      'Zéphyrin',
      "Rue de l'Exemple",
      '1204 Genève',
      'Quixote',
      'Ottoline',
      'Brackwater',
      'Quillfeather',
      'Zénobie',
      'Lausanne',
      'Kwazulu',
      'Plainpalais',
      'Fictivia',
      'Versoix',
      'Loyer avril',
      'Cadeau anniversaire',
      '210000000003139471430009017',
      '9930328TI0000005',
      '9930305TI0000001',
      '1187',
    ]) {
      expect(output, sensitive).not.toContain(sensitive);
    }
  });
});

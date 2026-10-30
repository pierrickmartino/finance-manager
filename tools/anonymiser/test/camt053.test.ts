import { describe, expect, test } from 'vitest';
import { anonymise, isValidIban, readStatement, reconciles } from '../src/index.ts';
import { readInput, SEED } from './helpers.ts';

const INPUT = 'camt053.xml';

describe('CAMT.053', () => {
  test('reads statement balances and entries', () => {
    const statement = readStatement('camt053', readInput(INPUT));

    expect(statement.currency).toBe('CHF');
    expect(statement.openingBalance).toBe(250000);
    expect(statement.closingBalance).toBe(613555);
    expect(statement.entries.map((e) => [e.bookingDate, e.amount, e.status])).toEqual([
      ['2025-03-05', 500000, 'BOOK'],
      ['2025-03-10', -135000, 'BOOK'],
      ['2025-03-31', -1445, 'BOOK'],
      ['2025-04-02', -8000, 'PDNG'],
    ]);
  });

  test('rejects a file that is not well-formed XML', () => {
    const broken = Buffer.from(readInput(INPUT).toString('utf8').replace('</Stmt>', ''));
    expect(() => readStatement('camt053', broken)).toThrow();
  });

  test('refuses comments and CDATA, which it cannot anonymise', () => {
    const withComment = Buffer.from(readInput(INPUT).toString('utf8').replace('<Stmt>', '<Stmt><!-- Quillfeather -->'));
    expect(() => anonymise('camt053', withComment, SEED)).toThrow(/comments/);
  });

  test('keeps amounts, dates and balances, and still reconciles', () => {
    const input = readInput(INPUT);
    const statement = readStatement('camt053', anonymise('camt053', input, SEED));

    expect(statement).toEqual(readStatement('camt053', input));
    expect(reconciles(statement)).toBe(true);
  });

  test('keeps the XML layout, UTF-8 and line endings', () => {
    const input = readInput(INPUT);
    const output = anonymise('camt053', input, SEED);

    const tags = (b: Buffer): string[] => [...b.toString('utf8').matchAll(/<\/?[\w:]+/g)].map((m) => m[0]);
    expect(tags(output)).toEqual(tags(input));
    expect(output.toString('utf8').split('\n')).toHaveLength(input.toString('utf8').split('\n').length);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(output)).not.toThrow();
    const text = output.toString('utf8');
    for (const kept of ['BCGECHGGXXX', '<Cd>OPBD</Cd>', '<SubFmlyCd>SALA</SubFmlyCd>', '<Ctry>CH</Ctry>', '<Prtry>QRR</Prtry>']) {
      expect(text).toContain(kept);
    }
  });

  test('is deterministic for a seed', () => {
    const input = readInput(INPUT);
    expect(anonymise('camt053', input, SEED).equals(anonymise('camt053', input, SEED))).toBe(true);
    expect(anonymise('camt053', input, SEED).equals(anonymise('camt053', input, 'other'))).toBe(false);
  });

  test('replaces IBANs with valid fakes, consistently with the same seed in a UBS file', () => {
    const camt = anonymise('camt053', readInput(INPUT), SEED).toString('utf8');
    const ubs = anonymise('ubs-csv', readInput('ubs.csv'), SEED).toString('utf8');

    const ibans = [...camt.matchAll(/<IBAN>([^<]+)<\/IBAN>/g)].map((m) => m[1]!);
    expect(ibans).toHaveLength(4);
    expect(ibans.every(isValidIban)).toBe(true);
    // CH9300762011623852957 is the statement account here and a counterparty in the UBS file.
    expect(ubs).toContain(`No de compte: ${ibans[0]}`);
    const refs = [...camt.matchAll(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/g)].map((m) => m[1]!);
    expect(refs[0]).toBe(refs[1]);
  });

  test('removes every name, address, account number, reference and payment text', () => {
    const output = anonymise('camt053', readInput(INPUT), SEED).toString('utf8');

    for (const sensitive of [
      'CH9300762011623852957',
      'CH7800240024018901234',
      'CH9100788000050812345',
      'CH3600483000012345678',
      'Aurélien',
      'Quillfeather',
      'Zénobie',
      'Avenue Imaginaire',
      'Lausanne',
      'Fictivia',
      'Rue du Prototype',
      'Versoix',
      'Zéphyrin',
      "Rue de l'Exemple",
      'Genève',
      'Ottoline',
      'Brackwater',
      'Cours de piano',
      'Kwazulu',
      'Salaire mars',
      '210000000003139471430009017',
      'BCGE20250305ZX0001',
      'BCGE20250402ZX0009',
      'FICTIVIA-PAY-2025-03',
      'E2E-Q-000451',
      'BCGEMSG20250401000123',
      'STMT20250331BCGE7781',
    ]) {
      expect(output, sensitive).not.toContain(sensitive);
    }
  });
});

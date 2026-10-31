import { describe, expect, it } from 'vitest';
import { fingerprintEntries } from './fingerprint';
import type { ParsedEntry } from './parsers';

const ACCOUNT = '00000000-0000-4000-8000-000000000001';

function entry(overrides: Partial<ParsedEntry> = {}): ParsedEntry {
  return {
    bookingDate: '2025-10-05',
    valueDate: '2025-10-05',
    amountMinor: -10000,
    currency: 'CHF',
    bankReference: null,
    rawDescription: 'Retrait Bancomat BCGE Genève Exemple',
    counterpartyName: null,
    counterpartyIban: null,
    paymentReference: null,
    bundledDetails: null,
    runningBalanceMinor: null,
    ...overrides,
  };
}

describe('Fingerprints (ADR-0003)', () => {
  it('is the bank reference when the entry has one', () => {
    expect(fingerprintEntries(ACCOUNT, [entry({ bankReference: 'BCGE20251010000342' })])).toEqual([
      'BCGE20251010000342',
    ]);
  });

  it('counts a bank reference repeated in the same file, keeping the first one bare', () => {
    // BCGE gives every card payment of a day's batch the same entry AcctSvcrRef.
    const fingerprints = fingerprintEntries(ACCOUNT, [
      entry({ bankReference: 'AH22391019/058226', amountMinor: -700 }),
      entry({ bankReference: 'AH22391019/058226', amountMinor: -14890 }),
      entry({ bankReference: 'BCGE20251010000342' }),
      entry({ bankReference: 'AH22391019/058226', amountMinor: -3400 }),
    ]);

    expect(fingerprints).toEqual([
      'AH22391019/058226',
      'AH22391019/058226#1',
      'BCGE20251010000342',
      'AH22391019/058226#2',
    ]);
  });

  it('hashes entries without a reference, counting identical ones in the same file', () => {
    const [first, second, other] = fingerprintEntries(ACCOUNT, [
      entry(),
      entry(),
      entry({ amountMinor: -7240 }),
    ]);

    expect(first).toMatch(/^h:[0-9a-f]{64}#0$/);
    expect(second).toBe(first!.replace(/#0$/, '#1'));
    expect(other).toMatch(/#0$/);
    expect(other!.slice(0, -2)).not.toBe(first!.slice(0, -2));
  });

  it('is stable across files and ignores case, accents and spacing in the description', () => {
    const [original] = fingerprintEntries(ACCOUNT, [entry()]);
    const [reworded] = fingerprintEntries(ACCOUNT, [
      entry({ rawDescription: '  RETRAIT  bancomat bcge GENEVE exemple ' }),
    ]);
    const [otherAccount] = fingerprintEntries('00000000-0000-4000-8000-000000000002', [entry()]);
    const [otherDay] = fingerprintEntries(ACCOUNT, [entry({ bookingDate: '2025-10-06' })]);

    expect(reworded).toBe(original);
    expect(otherAccount).not.toBe(original);
    expect(otherDay).not.toBe(original);
  });
});

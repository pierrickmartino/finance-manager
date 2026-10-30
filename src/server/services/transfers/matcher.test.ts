import { describe, expect, it } from 'vitest';
import { findTransferCandidates, type MatchEntry, type MatchTransaction } from './matcher';

const UBS = 'acc-ubs';
const BCGE_CHF = 'acc-bcge-chf';
const BCGE_EUR = 'acc-bcge-eur';
const CA = 'acc-ca';
const IBANS = new Map([
  [UBS, 'CH6900235235123456010'],
  [BCGE_CHF, 'CH3400788000050012345'],
  [BCGE_EUR, 'CH3100788000050012399'],
  [CA, null],
]);

/** CHF per EUR implied by the fixtures' cross-currency Transfer (1000 CHF → 1072.50 EUR). */
const toChfAt =
  (eurRate: number) =>
  (amountMinor: number, currency: string): number | null =>
    currency === 'CHF'
      ? amountMinor
      : currency === 'EUR'
        ? Math.round(amountMinor * eurRate)
        : null;

function entry(overrides: Partial<MatchEntry> = {}): MatchEntry {
  return {
    accountId: UBS,
    bookingDate: '2025-10-10',
    amountMinor: 200000,
    currency: 'CHF',
    counterpartyIban: null,
    ...overrides,
  };
}

let nextId = 0;
function existing(overrides: Partial<MatchTransaction> = {}): MatchTransaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    accountId: BCGE_CHF,
    bookingDate: '2025-10-10',
    amountMinor: -200000,
    currency: 'CHF',
    counterpartyIban: null,
    ...overrides,
  };
}

function match(entries: MatchEntry[], transactions: MatchTransaction[], toChf = toChfAt(0.9324)) {
  return findTransferCandidates({ entries, existing: transactions, accountIbans: IBANS, toChf });
}

const ids = (candidates: { transaction: MatchTransaction }[]) =>
  candidates.map((candidate) => candidate.transaction.id);

describe('Transfer matcher: same Currency', () => {
  it('finds a Transaction on another Account with the exactly opposite amount', () => {
    const other = existing();

    const [candidates] = match([entry()], [other]);

    expect(candidates).toEqual([
      { transaction: other, isIbanMatch: false, isPreselected: false, dayDistance: 0 },
    ]);
  });

  it('rejects an amount off by one cent', () => {
    expect(match([entry()], [existing({ amountMinor: -199999 })])).toEqual([[]]);
  });

  it('rejects the same sign and the same Account', () => {
    const sameSign = existing({ amountMinor: 200000 });
    const sameAccount = existing({ accountId: UBS });

    expect(match([entry()], [sameSign, sameAccount])).toEqual([[]]);
  });

  it('accepts booking dates 3 days apart and rejects 4, either way', () => {
    const threeBefore = existing({ bookingDate: '2025-10-07' });
    const threeAfter = existing({ bookingDate: '2025-10-13' });
    const fourBefore = existing({ bookingDate: '2025-10-06' });
    const fourAfter = existing({ bookingDate: '2025-10-14' });

    const [candidates] = match([entry()], [fourBefore, threeBefore, threeAfter, fourAfter]);

    expect(ids(candidates!).sort()).toEqual([threeBefore.id, threeAfter.id].sort());
    expect(candidates!.map((candidate) => candidate.dayDistance)).toEqual([3, 3]);
  });

  it('counts days across a month end', () => {
    const other = existing({ bookingDate: '2025-11-02' });

    expect(ids(match([entry({ bookingDate: '2025-10-30' })], [other])[0]!)).toEqual([other.id]);
  });
});

describe('Transfer matcher: cross Currency', () => {
  // UBS -1000.00 CHF on 2025-10-14 ↔ BCGE EUR +1072.50 EUR on 2025-10-15 (fixture README).
  const chfSide = entry({ bookingDate: '2025-10-14', amountMinor: -100000 });
  const eurSide = () =>
    existing({
      accountId: BCGE_EUR,
      bookingDate: '2025-10-15',
      amountMinor: 107250,
      currency: 'EUR',
    });

  it('accepts opposite amounts within 2% after conversion', () => {
    const other = eurSide();

    expect(ids(match([chfSide], [other], toChfAt(0.9324))[0]!)).toEqual([other.id]);
  });

  it('accepts a difference of exactly 2% and rejects 3%', () => {
    // 1072.50 EUR at 0.951049 CHF = 1020.00 CHF (2.0% over 1000), at 0.9604 = 1030.03 (3.0%).
    const other = eurSide();

    expect(ids(match([chfSide], [other], toChfAt(0.951049))[0]!)).toEqual([other.id]);
    expect(match([chfSide], [other], toChfAt(0.9604))).toEqual([[]]);
    expect(match([chfSide], [other], toChfAt(0.9))).toEqual([[]]);
  });

  it('finds nothing when a side has no FX rate', () => {
    expect(match([chfSide], [eurSide()], () => null)).toEqual([[]]);
  });
});

describe('Transfer matcher: IBAN pre-selection and ranking', () => {
  it('pre-selects a candidate when the entry names the other Account’s IBAN', () => {
    const other = existing();

    const [candidates] = match([entry({ counterpartyIban: 'CH3400788000050012345' })], [other]);

    expect(candidates).toEqual([
      { transaction: other, isIbanMatch: true, isPreselected: true, dayDistance: 0 },
    ]);
  });

  it('pre-selects from the other side when the entry has no counterparty IBAN (OFX)', () => {
    // BCGE EUR -500.00 names the Crédit Agricole IBAN; the OFX entry names nothing.
    const ibans = new Map([...IBANS, [CA, 'FR7618206004006123456789050']]);
    const other = existing({
      accountId: BCGE_EUR,
      bookingDate: '2025-10-20',
      amountMinor: -50000,
      currency: 'EUR',
      counterpartyIban: 'FR7618206004006123456789050',
    });

    const [candidates] = findTransferCandidates({
      entries: [
        entry({ accountId: CA, bookingDate: '2025-10-22', amountMinor: 50000, currency: 'EUR' }),
      ],
      existing: [other],
      accountIbans: ibans,
      toChf: toChfAt(0.9324),
    });

    expect(candidates).toEqual([
      { transaction: other, isIbanMatch: true, isPreselected: true, dayDistance: 2 },
    ]);
  });

  it('ranks the IBAN match first, then the closer amount, then the closer date', () => {
    const far = existing({ bookingDate: '2025-10-12' });
    const near = existing({ bookingDate: '2025-10-11' });
    const ibanMatch = existing({
      bookingDate: '2025-10-13',
      counterpartyIban: 'CH6900235235123456010',
    });
    const eurClose = existing({
      accountId: BCGE_EUR,
      amountMinor: -214000, // 1995.34 CHF: 0.2% off
      currency: 'EUR',
      bookingDate: '2025-10-10',
    });

    const [candidates] = match([entry()], [far, eurClose, near, ibanMatch]);

    expect(ids(candidates!)).toEqual([ibanMatch.id, near.id, far.id, eurClose.id]);
    expect(candidates!.map((candidate) => candidate.isPreselected)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('pre-selects one existing Transaction for one entry only', () => {
    const other = existing({ counterpartyIban: 'CH6900235235123456010' });

    const result = match([entry(), entry({ bookingDate: '2025-10-11' })], [other]);

    expect(result.map((candidates) => candidates.map((c) => c.isPreselected))).toEqual([
      [true],
      [false],
    ]);
  });

  it('never pre-selects without an IBAN match', () => {
    const [candidates] = match([entry()], [existing()]);

    expect(candidates!.every((candidate) => !candidate.isPreselected)).toBe(true);
  });
});

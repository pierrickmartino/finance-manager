import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createBank } from '../banks';
import { backfillRates, type EcbRateSource } from '../fx';
import { commitImport, previewImport } from '../imports';
import { archiveAccount, createAccount } from '.';
import { listAccountBalances } from './balances';

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/** The only test double: the ECB publishes the given CHF-per-EUR rate on each listed day. */
function ecbPublishing(rates: Record<string, string>): EcbRateSource {
  return {
    fetchReferenceRates: async ({ from, to }) =>
      Object.entries(rates)
        .filter(([date]) => date >= from && date <= to)
        .map(([date, chf]) => ({ date, perEur: { CHF: chf } })),
  };
}

async function setUpAccounts() {
  const bank = await createBank(t.ctx, { name: 'BCGE' });
  const base = { bankId: bank.id, kind: 'current' as const, importFormat: null };
  const eur = await createAccount(t.ctx, {
    ...base,
    name: 'Euros',
    currency: 'EUR',
    openingBalanceMinor: 100_000,
    openingDate: '2021-01-01',
  });
  const chf = await createAccount(t.ctx, {
    ...base,
    name: 'Francs',
    currency: 'CHF',
    openingBalanceMinor: 50_000,
    openingDate: '2021-01-01',
  });
  return { bank, eur, chf };
}

const RATES = { '2024-12-31': '0.9400', '2025-03-07': '0.9324', '2025-03-10': '0.9500' };

describe('Account balances in CHF', () => {
  it('shows each balance in its Currency and in CHF at the rate of the date', async () => {
    const { eur, chf } = await setUpAccounts();
    await backfillRates(t.ctx, ecbPublishing(RATES), { from: '2025-01-01', to: '2025-03-10' });

    // Saturday 8 March: valued at Friday's rate.
    const balances = await listAccountBalances(t.ctx, { date: '2025-03-08' });

    expect(balances).toEqual([
      {
        account: expect.objectContaining({ id: eur.id, currency: 'EUR' }),
        date: '2025-03-08',
        balanceMinor: 100_000,
        snapshotDate: null,
        chf: {
          amountMinor: 93_240,
          rate: {
            currency: 'EUR',
            date: '2025-03-08',
            rateDate: '2025-03-07',
            rateToChf: '0.9324',
          },
        },
      },
      {
        account: expect.objectContaining({ id: chf.id, currency: 'CHF' }),
        date: '2025-03-08',
        balanceMinor: 50_000,
        snapshotDate: null,
        chf: {
          amountMinor: 50_000,
          rate: { currency: 'CHF', date: '2025-03-08', rateDate: '2025-03-08', rateToChf: '1' },
        },
      },
    ]);
  });

  it('revalues the same EUR balance at each date', async () => {
    await setUpAccounts();
    await backfillRates(t.ctx, ecbPublishing(RATES), { from: '2025-01-01', to: '2025-03-10' });

    const eurInChf = async (date: string) =>
      (await listAccountBalances(t.ctx, { date }))[0]!.chf!.amountMinor;

    expect(await eurInChf('2025-01-15')).toBe(94_000);
    expect(await eurInChf('2025-03-07')).toBe(93_240);
    expect(await eurInChf('2025-03-10')).toBe(95_000);
  });

  it('values today at the newest rate by default', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-03-12T09:00:00Z') });
    await setUpAccounts();
    await backfillRates(t.ctx, ecbPublishing(RATES), { from: '2025-01-01' });

    const [eur] = await listAccountBalances(t.ctx);

    expect(eur).toMatchObject({
      date: '2025-03-12',
      chf: { amountMinor: 95_000, rate: { rateDate: '2025-03-10' } },
    });
  });

  it('has a zero balance before the opening date', async () => {
    await setUpAccounts();
    await backfillRates(t.ctx, ecbPublishing(RATES), { from: '2025-01-01', to: '2025-03-10' });

    const [eur] = await listAccountBalances(t.ctx, { date: '2020-12-31' });

    expect(eur).toMatchObject({ balanceMinor: 0 });
  });

  it('leaves the CHF value empty when there is no rate for the date', async () => {
    await setUpAccounts();

    const balances = await listAccountBalances(t.ctx, { date: '2025-03-08' });

    expect(balances.map((balance) => balance.chf?.amountMinor ?? null)).toEqual([null, 50_000]);
  });

  it('lists archived Accounts after active ones, as the Accounts list does', async () => {
    const { eur } = await setUpAccounts();
    await archiveAccount(t.ctx, eur.id);

    const balances = await listAccountBalances(t.ctx, { date: '2025-03-08' });

    expect(balances.map((balance) => balance.account.name)).toEqual(['Francs', 'Euros']);
  });

  it('rejects a malformed date', async () => {
    await expect(listAccountBalances(t.ctx, { date: '8.3.2025' })).rejects.toThrow(
      'Date must be a date (YYYY-MM-DD)',
    );
  });

  it('counts only the Transactions booked up to the date', async () => {
    const bank = await createBank(t.ctx, { name: 'UBS' });
    const account = await createAccount(t.ctx, {
      bankId: bank.id,
      name: 'UBS current',
      currency: 'CHF',
      iban: 'CH6900235235123456010',
      kind: 'current',
      importFormat: 'ubs_csv',
      openingBalanceMinor: 845_035,
    });
    const file = 'ubs-chf-2025-10.csv';
    const content = readFileSync(
      path.join(import.meta.dirname, '../../../../test/fixtures/import/ubs', file),
    );
    const preview = await previewImport(t.ctx, { accountId: account.id, fileName: file, content });
    await commitImport(t.ctx, { previewId: preview.id });

    const balanceOn = async (date: string) =>
      (await listAccountBalances(t.ctx, { date }))[0]!.balanceMinor;

    // The import opened the Account on the statement's first day, 2025-10-01.
    expect(await balanceOn('2025-09-30')).toBe(0);
    // Then the UBS running balance ("Solde") at the end of each day.
    expect(await balanceOn('2025-10-01')).toBe(630_035);
    expect(await balanceOn('2025-10-15')).toBe(701_290);
    expect(await balanceOn('2025-10-24')).toBe(1_332_065);
    expect(await balanceOn('2025-10-31')).toBe(1_290_305);
  });
});

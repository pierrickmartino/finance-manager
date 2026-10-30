import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount } from '../accounts';
import { createBank, listBanks } from '../banks';
import { listHistory } from '../history';
import {
  backfillRates,
  convertToChf,
  fetchDailyRates,
  getRate,
  getRateStatus,
  loadRateTable,
  type EcbRateSource,
  type ReferenceRateDay,
} from '.';

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

async function addAccount(name: string, currency: string, openingBalanceMinor = 0) {
  const banks = await listBanks(t.ctx);
  const bank = banks[0] ?? (await createBank(t.ctx, { name: 'UBS' }));
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    kind: 'current',
    currency,
    importFormat: null,
    openingBalanceMinor,
  });
}

/** Freezes "now" (pg keeps working: only Date is faked). */
function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) });
}

function isoDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`);) {
    days.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The only test double: an ECB source that publishes the given rates (units per EUR) on every
 * weekday, except listed holidays and overrides per day. Records each request.
 */
function stubEcb(
  perEur: Record<string, string>,
  options: { holidays?: string[]; days?: Record<string, Record<string, string>> } = {},
) {
  const requests: { currencies: string[]; from: string; to: string }[] = [];
  const source: EcbRateSource = {
    async fetchReferenceRates(request) {
      requests.push({ ...request, currencies: [...request.currencies].sort() });
      return isoDays(request.from, request.to)
        .filter((date) => !isWeekend(date) && !options.holidays?.includes(date))
        .map((date): ReferenceRateDay => ({
          date,
          perEur: Object.fromEntries(
            Object.entries({ ...perEur, ...options.days?.[date] }).filter(([currency]) =>
              request.currencies.includes(currency),
            ),
          ),
        }));
    },
  };
  return { source, requests };
}

describe('backfill', () => {
  it('fills every ECB day from 2021-01-01 up to today', async () => {
    setNow('2026-10-30T12:00:00Z');
    const { source } = stubEcb({ CHF: '0.9324' }, { holidays: ['2021-01-01'] });

    await backfillRates(t.ctx, source);

    // First and last business days of the range, at the ECB CHF-per-EUR rate.
    expect(await getRate(t.ctx, 'EUR', '2021-01-04')).toEqual({
      currency: 'EUR',
      date: '2021-01-04',
      rateDate: '2021-01-04',
      rateToChf: '0.9324',
    });
    expect((await getRate(t.ctx, 'EUR', '2026-10-30')).rateDate).toBe('2026-10-30');
    // 2021-01-01 is an ECB holiday: it still converts, with the last 2020 rate.
    expect((await getRate(t.ctx, 'EUR', '2021-01-01')).rateDate).toBe('2020-12-31');
  });

  it('fills only the range asked for', async () => {
    const { source, requests } = stubEcb({ CHF: '0.9324' });

    const result = await backfillRates(t.ctx, source, { from: '2025-01-06', to: '2025-01-10' });

    // A week of lookback before the range, then the range's five business days.
    expect(requests).toEqual([{ currencies: ['CHF'], from: '2024-12-30', to: '2025-01-10' }]);
    expect(result).toEqual({ from: '2024-12-30', to: '2025-01-10', inserted: 10, updated: 0 });
    await expect(getRate(t.ctx, 'EUR', '2024-12-27')).rejects.toThrow(
      'No FX rate for EUR on or before 2024-12-27',
    );
  });

  it('rejects a range that ends before it starts', async () => {
    const { source } = stubEcb({ CHF: '0.9324' });
    await expect(
      backfillRates(t.ctx, source, { from: '2025-02-01', to: '2025-01-01' }),
    ).rejects.toThrow('From must not be after To');
  });
});

describe('rate lookup', () => {
  it('falls back to the most recent earlier rate on a weekend', async () => {
    const { source } = stubEcb(
      { CHF: '0.9400' },
      { days: { '2025-04-18': { CHF: '0.9310' }, '2025-04-17': { CHF: '0.9320' } } },
    );
    await backfillRates(t.ctx, source, { from: '2025-04-14', to: '2025-04-21' });

    // Saturday and Sunday use Friday's rate.
    expect(await getRate(t.ctx, 'EUR', '2025-04-19')).toEqual({
      currency: 'EUR',
      date: '2025-04-19',
      rateDate: '2025-04-18',
      rateToChf: '0.931',
    });
    expect((await getRate(t.ctx, 'EUR', '2025-04-20')).rateDate).toBe('2025-04-18');
    expect((await getRate(t.ctx, 'EUR', '2025-04-21')).rateToChf).toBe('0.94');
  });

  it('falls back over a holiday', async () => {
    // Good Friday and Easter Monday 2025: the ECB publishes nothing from Thursday to Tuesday.
    const { source } = stubEcb(
      { CHF: '0.9400' },
      { holidays: ['2025-04-18', '2025-04-21'], days: { '2025-04-17': { CHF: '0.9320' } } },
    );
    await backfillRates(t.ctx, source, { from: '2025-04-14', to: '2025-04-22' });

    expect(await getRate(t.ctx, 'EUR', '2025-04-21')).toMatchObject({
      rateDate: '2025-04-17',
      rateToChf: '0.932',
    });
  });

  it('gives CHF a rate of 1 on any date, without fetching', async () => {
    expect(await getRate(t.ctx, 'chf', '2019-06-01')).toEqual({
      currency: 'CHF',
      date: '2019-06-01',
      rateDate: '2019-06-01',
      rateToChf: '1',
    });
  });

  it('rejects a malformed Currency or date', async () => {
    await expect(getRate(t.ctx, 'EURO', '2025-01-01')).rejects.toThrow('three-letter ISO code');
    await expect(getRate(t.ctx, 'EUR', '01.01.2025')).rejects.toThrow('ISO dates');
  });

  it('derives other Currencies from their EUR quotes', async () => {
    await addAccount('Dollars', 'USD');
    const { source, requests } = stubEcb({ CHF: '0.9300', USD: '1.0800' });

    await backfillRates(t.ctx, source, { from: '2025-03-03', to: '2025-03-03' });

    expect(requests[0]!.currencies).toEqual(['CHF', 'USD']);
    // 0.93 CHF per EUR / 1.08 USD per EUR = 0.8611111111 CHF per USD (10 decimals).
    expect((await getRate(t.ctx, 'USD', '2025-03-03')).rateToChf).toBe('0.8611111111');
    expect((await getRate(t.ctx, 'EUR', '2025-03-03')).rateToChf).toBe('0.93');
  });
});

describe('re-fetching', () => {
  it('is idempotent: the same days are not written twice', async () => {
    const { source } = stubEcb({ CHF: '0.9324' });
    const range = { from: '2025-01-06', to: '2025-01-10' };
    await backfillRates(t.ctx, source, range);

    const again = await backfillRates(t.ctx, source, range);

    expect(again).toMatchObject({ inserted: 0, updated: 0 });
    expect((await getRate(t.ctx, 'EUR', '2025-01-08')).rateToChf).toBe('0.9324');
  });

  it('takes a corrected rate', async () => {
    const range = { from: '2025-01-06', to: '2025-01-10' };
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, range);

    const corrected = stubEcb({ CHF: '0.9324' }, { days: { '2025-01-08': { CHF: '0.9330' } } });
    const result = await backfillRates(t.ctx, corrected.source, range);

    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    expect((await getRate(t.ctx, 'EUR', '2025-01-08')).rateToChf).toBe('0.933');
  });

  it('writes no History', async () => {
    setNow('2025-01-10T17:00:00Z');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, { from: '2025-01-06' });
    await fetchDailyRates(
      t.withActor({ type: 'system', id: null }),
      stubEcb({ CHF: '0.93' }).source,
    );

    expect(await listHistory(t.ctx)).toEqual([]);
  });
});

describe('daily fetch', () => {
  it('fetches from a week before the latest stored rate up to today', async () => {
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, {
      from: '2025-01-06',
      to: '2025-01-10',
    });
    setNow('2025-01-14T16:30:00Z');
    const { source, requests } = stubEcb({ CHF: '0.9350' });

    const result = await fetchDailyRates(t.ctx, source);

    expect(requests).toEqual([{ currencies: ['CHF'], from: '2025-01-03', to: '2025-01-14' }]);
    // Monday and Tuesday are new; the six stored business days from 3 to 10 January changed.
    expect(result).toEqual({ from: '2025-01-03', to: '2025-01-14', inserted: 2, updated: 6 });
    expect((await getRate(t.ctx, 'EUR', '2025-01-14')).rateToChf).toBe('0.935');
  });

  it('backfills from 2021 when no rate is stored yet', async () => {
    setNow('2025-01-14T16:30:00Z');
    const { source, requests } = stubEcb({ CHF: '0.9350' });

    await fetchDailyRates(t.ctx, source);

    expect(requests).toEqual([{ currencies: ['CHF'], from: '2020-12-25', to: '2025-01-14' }]);
  });

  it('backfills a Currency that a new Account brought in', async () => {
    setNow('2025-01-14T16:30:00Z');
    await fetchDailyRates(t.ctx, stubEcb({ CHF: '0.9350' }).source);
    await addAccount('Pounds', 'GBP');
    const { source, requests } = stubEcb({ CHF: '0.9350', GBP: '0.8500' });

    await fetchDailyRates(t.ctx, source);

    expect(requests).toEqual([
      { currencies: ['CHF', 'GBP'], from: '2020-12-25', to: '2025-01-14' },
    ]);
    expect((await getRate(t.ctx, 'GBP', '2021-01-04')).rateToChf).toBe('1.1');
  });
});

describe('rate status', () => {
  it('is stale before any rate was fetched', async () => {
    expect(await getRateStatus(t.ctx)).toEqual({
      lastFetchedAt: null,
      lastAttemptAt: null,
      lastError: null,
      latestRateDate: null,
      isStale: true,
      staleReason: 'No FX rates have been fetched yet',
    });
  });

  it('is fresh right after a daily fetch, even over a long weekend', async () => {
    // Fetched on the Thursday before Easter 2025, checked on Easter Monday evening: the ECB
    // published nothing on Friday or Monday.
    setNow('2025-04-17T16:30:00Z');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, { from: '2025-04-14' });
    setNow('2025-04-21T20:00:00Z');
    await fetchDailyRates(
      t.ctx,
      stubEcb({ CHF: '0.9324' }, { holidays: ['2025-04-18', '2025-04-21'] }).source,
    );

    expect(await getRateStatus(t.ctx)).toEqual({
      lastFetchedAt: new Date('2025-04-21T20:00:00Z'),
      lastAttemptAt: new Date('2025-04-21T20:00:00Z'),
      lastError: null,
      latestRateDate: '2025-04-17',
      isStale: false,
      staleReason: null,
    });
  });

  it('warns when the newest rate is more than five days old', async () => {
    setNow('2025-01-10T17:00:00Z');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, { from: '2025-01-06' });
    // The source keeps answering but publishes nothing after the 10th.
    setNow('2025-01-16T17:00:00Z');
    const silent = stubEcb(
      { CHF: '0.9324' },
      { holidays: ['2025-01-13', '2025-01-14', '2025-01-15', '2025-01-16'] },
    );
    await fetchDailyRates(t.ctx, silent.source);

    expect(await getRateStatus(t.ctx)).toMatchObject({
      latestRateDate: '2025-01-10',
      isStale: true,
      staleReason: 'The newest FX rate is from 2025-01-10',
    });
  });

  it('warns when no fetch has succeeded for two days', async () => {
    setNow('2025-01-10T17:00:00Z');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, { from: '2025-01-06' });
    setNow('2025-01-12T17:00:01Z');

    expect(await getRateStatus(t.ctx)).toMatchObject({
      latestRateDate: '2025-01-10',
      isStale: true,
      staleReason: 'FX rates were last fetched more than 48 hours ago',
    });
  });

  it('records a failed fetch and keeps the last successful one', async () => {
    setNow('2025-01-10T17:00:00Z');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9324' }).source, { from: '2025-01-06' });
    setNow('2025-01-11T17:00:00Z');
    const failing: EcbRateSource = {
      fetchReferenceRates: () => Promise.reject(new Error('ECB answered 503')),
    };

    await expect(fetchDailyRates(t.ctx, failing)).rejects.toThrow('ECB answered 503');

    expect(await getRateStatus(t.ctx)).toMatchObject({
      lastFetchedAt: new Date('2025-01-10T17:00:00Z'),
      lastAttemptAt: new Date('2025-01-11T17:00:00Z'),
      lastError: 'ECB answered 503',
      isStale: false,
    });
  });

  it('rejects malformed data from the source and stores nothing', async () => {
    const broken: EcbRateSource = {
      fetchReferenceRates: async () => [{ date: '2025-01-06', perEur: { CHF: '-1' } }],
    };

    await expect(
      backfillRates(t.ctx, broken, { from: '2025-01-06', to: '2025-01-06' }),
    ).rejects.toThrow('Malformed ECB rates');

    await expect(getRate(t.ctx, 'EUR', '2025-01-06')).rejects.toThrow('No FX rate');
    expect((await getRateStatus(t.ctx)).lastError).toMatch(/^Malformed ECB rates/);
  });
});

describe('rate table', () => {
  it('answers lookups over a range, falling back to the last rate before it', async () => {
    await addAccount('Dollars', 'USD');
    const { source } = stubEcb(
      { CHF: '0.9300', USD: '1.0000' },
      { days: { '2025-03-07': { CHF: '0.9400', USD: '1.0000' } } },
    );
    await backfillRates(t.ctx, source, { from: '2025-03-03', to: '2025-03-14' });

    const table = await loadRateTable(t.ctx, { from: '2025-03-08', to: '2025-03-12' });

    // Saturday falls back to Friday, which is before the range.
    expect(table.rateOn('EUR', '2025-03-08')).toEqual({
      currency: 'EUR',
      date: '2025-03-08',
      rateDate: '2025-03-07',
      rateToChf: '0.94',
    });
    expect(table.rateOn('USD', '2025-03-11')).toMatchObject({ rateDate: '2025-03-11' });
    expect(table.toChf(10_000, 'EUR', '2025-03-10')).toMatchObject({ amountMinor: 9_300 });
    expect(table.toChf(10_000, 'CHF', '2025-03-10')).toMatchObject({ amountMinor: 10_000 });
    expect(table.rateOn('GBP', '2025-03-10')).toBeNull();
    expect(table.toChf(10_000, 'GBP', '2025-03-10')).toBeNull();
  });

  it('loads only the Currencies asked for', async () => {
    await addAccount('Dollars', 'USD');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9300', USD: '1.0000' }).source, {
      from: '2025-03-03',
      to: '2025-03-07',
    });

    const table = await loadRateTable(t.ctx, {
      currencies: ['USD'],
      from: '2025-03-03',
      to: '2025-03-07',
    });

    expect(table.rateOn('USD', '2025-03-05')).not.toBeNull();
    expect(table.rateOn('EUR', '2025-03-05')).toBeNull();
  });
});

describe('conversion to CHF', () => {
  async function withEurRate(chfPerEur: string): Promise<void> {
    await backfillRates(t.ctx, stubEcb({ CHF: chfPerEur }).source, {
      from: '2025-03-03',
      to: '2025-03-07',
    });
  }

  it('converts EUR minor units at the rate of the date', async () => {
    await withEurRate('0.9324');

    // EUR 10.01 × 0.9324 = CHF 9.333324 → CHF 9.33
    expect(
      await convertToChf(t.ctx, { amountMinor: 1001, currency: 'EUR', date: '2025-03-08' }),
    ).toEqual({
      amountMinor: 933,
      rate: { currency: 'EUR', date: '2025-03-08', rateDate: '2025-03-07', rateToChf: '0.9324' },
    });
  });

  it('rounds half away from zero, for credits and debits alike', async () => {
    await withEurRate('0.9330');
    const at = (amountMinor: number) =>
      convertToChf(t.ctx, { amountMinor, currency: 'EUR', date: '2025-03-05' }).then(
        (value) => value.amountMinor,
      );

    // EUR 0.50 × 0.933 = CHF 0.4665 → 0.47; EUR 0.10 × 0.933 = 0.0933 → 0.09
    expect(await at(50)).toBe(47);
    expect(await at(-50)).toBe(-47);
    expect(await at(10)).toBe(9);
    expect(await at(-10)).toBe(-9);
    expect(await at(0)).toBe(0);
  });

  it('is exact on large amounts', async () => {
    await withEurRate('0.9324');
    // EUR 1'234'567'890.12 × 0.9324 = CHF 1'151'111'100.747888 → 1'151'111'100.75
    const value = await convertToChf(t.ctx, {
      amountMinor: 123_456_789_012,
      currency: 'EUR',
      date: '2025-03-05',
    });
    expect(value.amountMinor).toBe(115_111_110_075);
  });

  it('scales by the Currency minor units', async () => {
    await addAccount('Yen', 'JPY');
    await backfillRates(t.ctx, stubEcb({ CHF: '0.9300', JPY: '160.00' }).source, {
      from: '2025-03-03',
      to: '2025-03-03',
    });

    // JPY has no minor unit: JPY 1000 × (0.93 / 160) = CHF 5.8125 → CHF 5.81
    const value = await convertToChf(t.ctx, {
      amountMinor: 1000,
      currency: 'JPY',
      date: '2025-03-03',
    });
    expect(value.amountMinor).toBe(581);
  });

  it('leaves CHF unchanged', async () => {
    expect(
      await convertToChf(t.ctx, { amountMinor: -12345, currency: 'CHF', date: '2025-03-05' }),
    ).toMatchObject({ amountMinor: -12345, rate: { rateToChf: '1' } });
  });

  it('fails when no rate exists on or before the date', async () => {
    await withEurRate('0.9324');
    await expect(
      convertToChf(t.ctx, { amountMinor: 100, currency: 'EUR', date: '2025-02-23' }),
    ).rejects.toThrow('No FX rate for EUR on or before 2025-02-23');
  });

  it('rejects an amount that is not whole minor units', async () => {
    await expect(
      convertToChf(t.ctx, { amountMinor: 1.5, currency: 'CHF', date: '2025-03-05' }),
    ).rejects.toThrow('whole number of minor units');
  });
});

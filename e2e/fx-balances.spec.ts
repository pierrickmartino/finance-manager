import { expect, test } from '@playwright/test';
import { createDb } from '../src/server/db/client';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { backfillRates, type EcbRateSource } from '../src/server/services/fx';
import { databaseUrl } from '../test/support/postgres';
import { accountDetail, accountListEntry } from './support/accounts';

/** The only test double: an ECB that publishes 0.9324 CHF per EUR on weekdays. */
const ecb: EcbRateSource = {
  async fetchReferenceRates({ from, to }) {
    const days = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`);) {
      if (d.getUTCDay() % 6 !== 0) {
        days.push({ date: d.toISOString().slice(0, 10), perEur: { CHF: '0.9324' } });
      }
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }
    return days;
  },
};

test('shows Account balances in CHF at the rate of the chosen date, and warns of stale rates', async ({
  page,
}) => {
  const suffix = Date.now();
  const db = createDb(databaseUrl(process.env.E2E_DATABASE_NAME!));
  const ctx = { db, actor: { type: 'manual' as const, id: null } };
  try {
    // Rates for early March 2025 only, so the newest rate is always stale.
    await backfillRates(ctx, ecb, { from: '2025-03-03', to: '2025-03-10' });
    const bank = await createBank(ctx, { name: `Crédit Agricole ${suffix}` });
    const base = { bankId: bank.id, kind: 'current' as const, importFormat: null };
    await createAccount(ctx, {
      ...base,
      name: `Euros ${suffix}`,
      currency: 'EUR',
      openingBalanceMinor: 100_000,
      openingDate: '2021-01-01',
    });
    await createAccount(ctx, {
      ...base,
      name: `Francs ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 50_000,
      openingDate: '2021-01-01',
    });
  } finally {
    await db.end();
  }

  await page.goto('/accounts');
  await expect(page.getByRole('alert').filter({ hasText: 'FX rates are stale' })).toContainText(
    'The newest FX rate is from 2025-03-10',
  );

  // Saturday 8 March 2025: valued at Friday's rate. The date keeps the selected Account.
  await accountListEntry(page, `Euros ${suffix}`).click();
  await page.getByLabel('Balances on').fill('2025-03-08');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(/date=2025-03-08/);
  const euros = accountDetail(page, `Euros ${suffix}`);
  await expect(euros).toContainText("EUR 1'000.00");
  await expect(euros).toContainText('CHF 932.40');
  await expect(euros).toContainText('at 0.9324 (07.03.2025)');
  await expect(accountListEntry(page, `Francs ${suffix}`)).toContainText('CHF 500.00');

  // Before the opening date and before any rate.
  await page.getByLabel('Balances on').fill('2020-12-31');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(euros).toContainText('EUR 0.00');
  await expect(euros).toContainText('No FX rate');
});

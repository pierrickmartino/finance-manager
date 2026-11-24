import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { openHomeDashboard } from './support/dashboards';
import { withServices } from './support/services';

// The Completeness check's problems are Attention items in the notifications bell (ADR-0019),
// covered by app-shell.spec.ts; no page shows a notice of its own any more.
test('neither Analytics nor the home Dashboard shows a Completeness check notice', async ({
  page,
}) => {
  const suffix = Date.now();
  await withServices(async (ctx) => {
    // An Account with no Import yet, so the check has a problem it could show.
    const bank = await createBank(ctx, { name: `Completeness ${suffix}` });
    await createAccount(ctx, {
      bankId: bank.id,
      name: `Unimported ${suffix}`,
      currency: 'CHF',
      iban: null,
      kind: 'current',
      importFormat: 'camt053',
      openingBalanceMinor: 0,
    });
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('form', { name: 'Period' })).toBeVisible();
  await expect(page.getByLabel('Completeness check')).toHaveCount(0);
  await expect(page.getByText(/needs? attention/)).toHaveCount(0);

  await openHomeDashboard(page);
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
  await expect(page.getByLabel('Completeness check')).toHaveCount(0);
});

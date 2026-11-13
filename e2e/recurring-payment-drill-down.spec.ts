import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/**
 * One Payee charging two monthly series: 49.00 ("Mobile") and 79.00 ("Internet"), three charges
 * each, the latest a few days ago.
 */
async function seedTwoSeries(payeeName: string, suffix: number): Promise<void> {
  const today = swissToday();
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Recurring drill ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Phone card ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: `Telecom ${suffix}`, type: 'expense' });
    const category = await createCategory(ctx, { groupId: group.id, name: 'Phone' });
    for (const daysAgo of [64, 34, 4]) {
      for (const [description, amountMinor] of [
        ['Mobile', -49_00],
        ['Internet', -79_00],
      ] as const) {
        const created = await createManualTransaction(ctx, {
          accountId: account.id,
          bookingDate: addDays(today, -daysAgo),
          amountMinor,
          description: `${description} ${suffix}`,
        });
        await editClassification(ctx, created.id, { payeeName, categoryId: category.id });
      }
    }
  });
}

test("a Recurring payment's row opens a Drill-down of exactly its charges", async ({ page }) => {
  const suffix = Date.now();
  const payeeName = `Telco ${suffix}`;
  await seedTwoSeries(payeeName, suffix);

  await page.goto('/recurring-payments');
  await page
    .getByRole('list', { name: 'Recurring payments' })
    .getByRole('listitem')
    .filter({ hasText: payeeName })
    .filter({ hasText: 'CHF 49.00' })
    .getByRole('link', { name: payeeName })
    .click();

  await expect(
    page.getByRole('heading', { level: 1, name: `Charges of ${payeeName}` }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('3 charges · last CHF 49.00');
  const rows = page.getByRole('table', { name: 'Drill-down Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    await expect(row).toContainText(`Mobile ${suffix}`);
    await expect(row).toContainText('-49.00');
  }

  await page.getByRole('link', { name: 'Back to Recurring payments' }).click();
  await expect(page).toHaveURL(/\/recurring-payments$/);
});

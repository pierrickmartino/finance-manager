// PROTOTYPE, throwaway: screenshots the net worth card's variants on the starter Dashboard.
import { test, expect } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

const OUT = process.env.SHOTS!;

test('net worth variants', async ({ page }) => {
  test.setTimeout(240_000);
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: 'UBS' });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: 'Main',
      currency: 'CHF',
      openingBalanceMinor: 42_000_00,
      openingDate: '2024-01-01',
    });
    const inc = await createCategory(ctx, {
      groupId: (await createCategoryGroup(ctx, { name: 'Earnings', type: 'income' })).id,
      name: 'Salary',
    });
    const exGroup = (await createCategoryGroup(ctx, { name: 'Living', type: 'expense' })).id;
    const housing = await createCategory(ctx, { groupId: exGroup, name: 'Housing' });
    const food = await createCategory(ctx, { groupId: exGroup, name: 'Food' });
    const cat: Record<string, string> = {
      Salary: inc.id,
      Rent: housing.id,
      Groceries: food.id,
      Coop: food.id,
    };
    const today = swissToday();
    for (let m = 0; m < 12; m++) {
      const base = -30 * m - 2;
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: addDays(today, base),
        amountMinor: 7800_00,
        description: 'Salary',
      });
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: addDays(today, base - 3),
        amountMinor: -2400_00,
        description: 'Rent',
      });
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: addDays(today, base - 6),
        amountMinor: -(2500_00 + ((m * 977) % 3200) * 100),
        description: 'Groceries',
      });
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: addDays(today, base - 9),
        amountMinor: -(300_00 + ((m * 431) % 900) * 100),
        description: 'Coop',
      });
    }
    for (const [d, id] of Object.entries(cat)) {
      await ctx.db.query('UPDATE "transaction" SET category_id = $1 WHERE raw_description = $2', [
        id,
        d,
      ]);
    }
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboards\//);
  const home = new URL(page.url()).pathname;
  for (const v of ['now', 'A', 'B', 'C']) {
    await page.goto(`${home}?variant=${v}`);
    await expect(page.getByRole('heading', { name: 'Recent activity', level: 2 })).toBeVisible();
    await page.waitForTimeout(2500);
    console.log(
      v,
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll('[aria-labelledby^=overview-]')].map((e) => [
            e.getAttribute('aria-labelledby'),
            Math.round(e.getBoundingClientRect().height),
            e.className,
          ]),
        ),
      ),
    );
    const row = page.locator('#overview-headline').locator('xpath=ancestor::section[1]/..');
    await row.screenshot({ path: `${OUT}/${v}.png` });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${home}?variant=A`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/A-phone.png`, fullPage: true });
});

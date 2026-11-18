import { expect, test, type Locator, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import {
  addWidget,
  createDashboard as createDashboardRecord,
} from '../src/server/services/dashboards';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/**
 * A Widget's card on the board. Not `widgetCard`: on a Dashboard without Account balances the
 * overview's headline is labelled with this Widget's name too.
 */
function boardCard(page: Page, name: string): Locator {
  return page.locator('section[aria-labelledby^="card-"]', {
    has: page.getByRole('heading', { name, exact: true }),
  });
}

// The e2e database is shared by every spec, so totals include other specs' Accounts: these
// tests check the wording, the dates and the links, not the amounts.

test('a Net worth Widget tells its change, and a point opens the Accounts as of that date', async ({
  page,
}) => {
  const suffix = Date.now();
  const dashboardId = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Net worth bank ${suffix}` });
    await createAccount(ctx, {
      bankId: bank.id,
      kind: 'savings',
      importFormat: null,
      name: `Net worth savings ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 1000_00,
      openingDate: '2025-02-10',
    });
    const dashboard = await createDashboardRecord(ctx, { name: `Net worth ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'Wealth over time',
      source: 'account_balances',
      visualisation: 'line',
      query: {
        dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
        rows: 'month',
      },
    });
    return dashboard.id;
  });

  await page.goto(`/dashboards/${dashboardId}`);
  const card = boardCard(page, 'Wealth over time');
  await expect(card).toContainText(
    /Net worth was CHF [^,]+ at the end of Mar 2025, (up CHF [^ ]+|down CHF [^ ]+|unchanged) over Jan 2025 – Mar 2025\./,
  );
  await expect(card.getByRole('link', { name: /^(Jan|Feb|Mar) 2025: CHF/ })).toHaveCount(3);

  await card.getByText('Change over Jan 2025 – Mar 2025').locator('..').getByRole('link').click();
  await expect(page).toHaveURL(/\/accounts\?date=2025-03-31$/);

  await page.goBack();
  await boardCard(page, 'Wealth over time')
    .getByRole('link', { name: /^Feb 2025: CHF/ })
    .click();
  await expect(page).toHaveURL(/\/accounts\?date=2025-02-28$/);
  await expect(page.getByLabel('Balances on')).toHaveValue('2025-02-28');
});

test('a new balances Widget in the editor is Net worth by month over the last 24 months', async ({
  page,
}) => {
  await page.goto('/widgets/new');
  await page
    .getByRole('navigation', { name: 'Widget source' })
    .getByText('Account balances')
    .click();

  await expect(page).toHaveURL(/source=account_balances/);
  await expect(page.getByRole('combobox', { name: 'Time axis' })).toHaveValue('month');
  await expect(page.getByRole('spinbutton', { name: 'Number of periods' })).toHaveValue('24');
  await expect(page.getByText('as Net worth').first()).toBeVisible();
});

test('a balances Widget filters by Account, Bank and Account kind, and says when none is left', async ({
  page,
}) => {
  const suffix = Date.now();
  const bankName = `Filtered bank ${suffix}`;
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: bankName });
    await createAccount(ctx, {
      bankId: bank.id,
      kind: 'savings',
      importFormat: null,
      name: `Filtered savings ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 1000_00,
      openingDate: '2025-02-10',
    });
  });

  await page.goto('/widgets/new?source=account_balances');
  const form = page.getByRole('form', { name: 'Widget query' });
  await form.locator('summary', { hasText: 'Filters' }).click();
  for (const filter of ['Accounts', 'Banks', 'Account kinds']) {
    await expect(form.locator('summary', { hasText: filter })).toBeVisible();
  }
  for (const filter of ['Categories', 'Payees', 'Tags', 'Currencies']) {
    await expect(form.locator('summary', { hasText: filter })).toHaveCount(0);
  }

  // Only this Bank's Accounts count: its savings Account alone.
  await form.locator('summary', { hasText: 'Banks' }).click();
  await form.getByRole('checkbox', { name: bankName }).check();
  await expect(page).toHaveURL(/[?&]bank=/);
  await expect(page.getByText(/Net worth was CHF 1\D?000 at the end of/)).toBeVisible();

  // The Bank holds no loan: no Account is left.
  await form.locator('summary', { hasText: 'Account kinds' }).click();
  await form.getByRole('checkbox', { name: 'Loan' }).check();
  await expect(page).toHaveURL(/[?&]kind=loan/);
  await expect(page.getByText("No Account matches this Widget's filters.")).toBeVisible();
});

test('a Capital movement is a marker on the Net worth line that opens its Transaction', async ({
  page,
}) => {
  const suffix = Date.now();
  const payee = `Notary ${suffix}`;
  const { dashboardId, transactionId } = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Capital bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Capital current ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 500_000_00,
      openingDate: '2025-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: `Capital ${suffix}`, type: 'capital' });
    const property = await createCategory(ctx, { groupId: group.id, name: 'Property' });
    const purchase = await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: '2025-02-20',
      amountMinor: -300_000_00,
      description: `Flat deposit ${suffix}`,
    });
    await editClassification(ctx, purchase.id, { categoryId: property.id, payeeName: payee });
    const dashboard = await createDashboardRecord(ctx, { name: `Capital ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'Wealth and capital',
      source: 'account_balances',
      visualisation: 'line',
      query: {
        dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
        rows: 'month',
        filters: { accountIds: [account.id] },
      },
    });
    return { dashboardId: dashboard.id, transactionId: purchase.id };
  });

  await page.goto(`/dashboards/${dashboardId}`);
  const card = boardCard(page, 'Wealth and capital');
  // Filtered to its own Account, so the count isn't touched by other specs' Transactions.
  await expect(card.getByText('Capital movements', { exact: true }).locator('..')).toHaveText(
    'Capital movements1',
  );
  const marker = card.getByRole('link', {
    name: new RegExp(`^Capital movement on 2025-02-20: ${payee}: CHF`),
  });
  await expect(marker).toHaveCount(1);

  await marker.click();
  await expect(page).toHaveURL(new RegExp(`/transactions/${transactionId}$`));
});

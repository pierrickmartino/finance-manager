import { expect, test, type Page } from '@playwright/test';
import { openNewAccountForm } from './support/accounts';

function bankListEntry(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Bank list' }).getByRole('link', { name });
}

test('creates a Bank from the New Bank pane and selects it', async ({ page }) => {
  // The E2E database is shared by the whole run: use a name no other test creates.
  const name = `UBS ${Date.now()}`;

  await page.goto('/banks');
  await page.getByRole('link', { name: '+ New Bank' }).click();
  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();

  await expect(page).toHaveURL(/\/banks\?bank=[0-9a-f-]+$/);
  await expect(bankListEntry(page, name)).toHaveAttribute('aria-current', 'true');
  const detail = page.getByRole('article', { name });
  await expect(detail.getByRole('heading', { name, level: 2 })).toBeVisible();
  await expect(detail.getByText('No Accounts at this Bank yet.')).toBeVisible();

  await page.reload();
  await expect(bankListEntry(page, name)).toBeVisible();
});

test('shows why a Bank could not be created', async ({ page }) => {
  const name = `Cler ${Date.now()}`;
  await page.goto('/banks?bank=new');

  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(bankListEntry(page, name)).toBeVisible();

  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();

  await expect(page.getByText(`A Bank named "${name}" already exists`)).toHaveRole('alert');
});

test("lists a Bank's Accounts with their balances and its CHF total", async ({ page }) => {
  const name = `BCGE ${Date.now()}`;
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(bankListEntry(page, name)).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: name });
  await form.getByLabel('Account name').fill('Savings');
  await form.getByLabel('Kind').selectOption({ label: 'Savings' });
  await form.getByLabel('Opening balance').fill("1'250.50");
  await form.getByRole('button', { name: 'Add Account' }).click();
  await expect(page).toHaveURL(/account=(?!new)/);

  await page.goto('/banks');
  await bankListEntry(page, name).click();
  const detail = page.getByRole('article', { name });
  const savings = detail.getByRole('row', { name: /Savings/ });
  await expect(savings).toContainText("CHF 1'250.50");
  await expect(bankListEntry(page, name)).toContainText('1 Account');
  await expect(bankListEntry(page, name)).toContainText("CHF 1'250.50");
  await expect(detail.getByRole('definition')).toContainText("CHF 1'250.50");

  await savings.getByRole('link', { name: 'Savings' }).click();
  await expect(page).toHaveURL(/\/accounts\?account=/);
});

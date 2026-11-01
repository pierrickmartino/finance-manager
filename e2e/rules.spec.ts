import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { addExpenseCategory } from './support/categories';
import { addPayee } from './support/payees';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

async function addNamed(page: Page, route: string, noun: string, name: string): Promise<void> {
  await page.goto(route);
  const form = page.getByRole('form', { name: `New ${noun}` });
  await form.getByLabel(`${noun} name`).fill(name);
  await form.getByRole('button', { name: `Add ${noun}` }).click();
  await expect(page.getByLabel(`Name of ${name}`)).toBeVisible();
}

test('creates and orders Rules, and the import preview shows what each Rule sets', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test, and
  // every Rule is limited to this test's Account so other tests' imports stay unclassified.
  const suffix = Date.now();
  const bankName = `Rules bank ${suffix}`;
  const accountName = `Rules account ${suffix}`;
  const accountLabel = `${bankName} · ${accountName}`;
  const groupName = `Food ${suffix}`;
  const categoryName = `Groceries ${suffix}`;
  const payeeName = `Migros ${suffix}`;
  const tagName = `card ${suffix}`;
  const migrosRule = `Migros rule ${suffix}`;
  const cardRule = `Card rule ${suffix}`;
  page.on('dialog', (dialog) => void dialog.accept());

  await addExpenseCategory(page, groupName, categoryName);
  await addPayee(page, payeeName);
  await addNamed(page, '/tags', 'Tag', tagName);

  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();
  await page.goto('/accounts');
  const accountForm = page.getByRole('region', { name: 'New Account' });
  await accountForm.getByLabel('Bank').selectOption({ label: bankName });
  await accountForm.getByLabel('Account name').fill(accountName);
  await accountForm.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await accountForm.getByRole('button', { name: 'Add Account' }).click();
  await expect(page.getByRole('row').filter({ hasText: accountName })).toBeVisible();

  // A catastrophic regex is refused when the Rule is saved
  await page.goto('/rules/new');
  const form = page.getByRole('form', { name: 'Rule' });
  await form.getByLabel('Name', { exact: true }).fill(migrosRule);
  await form.getByLabel('Condition 1 operator').selectOption({ label: 'matches regex' });
  await form.getByLabel('Condition 1 value').fill('(a+)+');
  await form.getByLabel('Set Payee').selectOption({ label: payeeName });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(form.getByRole('alert')).toContainText('nested repetition');

  // The first Rule: Migros card payments on this Account get a Payee and a Category
  await form.getByLabel('Condition 1 operator').selectOption({ label: 'contains' });
  await form.getByLabel('Condition 1 value').fill('MIGROS exemple');
  await form.getByRole('button', { name: 'Add condition' }).click();
  await form.getByLabel('Condition 2 field').selectOption({ label: 'Account' });
  await form.getByRole('checkbox', { name: accountLabel }).check();
  await form.getByLabel('Set Category').selectOption({ label: categoryName });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(page.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible();

  // The second Rule: payments of 10 to 100 out of this Account get a Tag
  await page.goto('/rules/new');
  await form.getByLabel('Name', { exact: true }).fill(cardRule);
  await form.getByLabel('Condition 1 field').selectOption({ label: 'Account' });
  await form.getByRole('checkbox', { name: accountLabel }).check();
  await form.getByRole('button', { name: 'Add condition' }).click();
  await form.getByLabel('Condition 2 field').selectOption({ label: 'Amount' });
  await form.getByLabel('Condition 2 operator').selectOption({ label: 'between' });
  await form.getByLabel('Condition 2 value').fill('-100.00');
  await form.getByLabel('Condition 2 to').fill('-10');
  await form.getByRole('checkbox', { name: tagName }).check();
  await form.getByRole('button', { name: 'Create Rule' }).click();

  const rules = page.getByRole('list', { name: 'Rules', exact: true });
  const migrosRow = rules.getByRole('listitem').filter({ hasText: migrosRule });
  const cardRow = rules.getByRole('listitem').filter({ hasText: cardRule });
  const detail = (name: string) => page.getByRole('article', { name });

  // Picking a Rule in the list spells it out in the detail pane
  await migrosRow.getByRole('link').click();
  await expect(page).toHaveURL(/[?&]rule=/);
  await expect(detail(migrosRule)).toContainText(`Description contains "MIGROS exemple"`);
  await expect(detail(migrosRule)).toContainText(`Account is ${accountLabel}`);
  await expect(detail(migrosRule).getByRole('list', { name: 'Sets' })).toContainText(
    `Payee: ${payeeName}Category: ${groupName} › ${categoryName}`,
  );
  await cardRow.getByRole('link').click();
  await expect(detail(cardRule)).toContainText('Amount between -100.00 and -10.00');
  await expect(detail(cardRule)).toContainText(`Tag: ${tagName}`);

  // The filter narrows the list to Rules whose name, conditions or actions match
  await page.getByLabel('Filter Rules').fill('MIGROS exemple');
  await page.getByLabel('Filter Rules').press('Enter');
  await expect(migrosRow).toBeVisible();
  await expect(cardRow).toHaveCount(0);
  await page.getByRole('link', { name: 'Clear' }).click();
  await expect(cardRow).toBeVisible();

  // Drag the card Rule above the Migros Rule; the new order is saved
  await cardRow.getByRole('img', { name: `Drag ${cardRule}` }).dragTo(migrosRow);
  await expect(rules).toHaveAttribute('aria-busy', 'false');
  await page.reload();
  const order = async () => {
    const names = await rules.getByRole('listitem').allTextContents();
    return (name: string) => names.findIndex((text) => text.includes(name));
  };
  let position = await order();
  expect(position(cardRule)).toBeLessThan(position(migrosRule));

  // The detail pane's move buttons change the order too
  await cardRow.getByRole('link').click();
  await detail(cardRule)
    .getByRole('button', { name: `Move ${cardRule} down` })
    .click();
  await expect(rules).toHaveAttribute('aria-busy', 'false');
  await page.reload();
  position = await order();
  expect(position(migrosRule)).toBeLessThan(position(cardRule));
  await cardRow.getByRole('link').click();
  await detail(cardRule)
    .getByRole('button', { name: `Move ${cardRule} up` })
    .click();
  await expect(rules).toHaveAttribute('aria-busy', 'false');

  // Import: the preview shows what the Rules set and which Rule set each
  await page.goto('/accounts');
  await page.getByRole('row').filter({ hasText: accountName }).getByRole('link').click();
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  const entries = page.getByRole('table', { name: 'Entries' }).locator('tbody tr');
  const migros = entries.filter({ hasText: '9930275TI0000102' });
  await expect(migros).toContainText(`Payee${payeeName} (Rule ${migrosRule})`);
  await expect(migros).toContainText(`Category${groupName} › ${categoryName} (Rule ${migrosRule})`);
  await expect(migros).toContainText(`Tags${tagName} (Rule ${cardRule})`);
  await expect(entries.filter({ hasText: '9930274TI0000101' })).toContainText('No Rule matched');

  // Disabling a Rule takes it out of the preview
  const previewUrl = page.url();
  await page.goto('/rules');
  await cardRow.getByRole('link').click();
  await detail(cardRule).getByRole('switch', { name: 'Enabled' }).click();
  await expect(detail(cardRule).getByRole('switch', { name: 'Disabled' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(cardRow).toContainText('(Disabled)');
  await page.goto(previewUrl);
  await expect(migros).not.toContainText(tagName);
  await page.getByRole('button', { name: /Commit import/ }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  // Clean up: Rules are global
  await page.goto('/rules');
  await migrosRow.getByRole('link').click();
  await detail(migrosRule).getByRole('button', { name: 'Delete' }).click();
  await expect(migrosRow).toHaveCount(0);
  await cardRow.getByRole('link').click();
  await detail(cardRule).getByRole('button', { name: 'Delete' }).click();
  await expect(cardRow).toHaveCount(0);
});

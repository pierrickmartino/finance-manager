/** Category page steps shared by the specs that need a Category of their own. */
import { expect, type Page } from '@playwright/test';

/** Adds a group from the Categories page; the page then shows it. */
export async function addCategoryGroup(page: Page, name: string, type: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Category groups' }).getByText('+ New group').click();
  const form = page.getByRole('form', { name: 'New Category group' });
  await form.getByLabel('Group name').fill(name);
  await form.getByLabel('Type').selectOption({ label: type });
  await form.getByRole('button', { name: 'Add group' }).click();
  await expect(page.getByRole('region', { name: `Group ${name}` })).toBeVisible();
}

/** Adds a Category to the group the Categories page shows. */
export async function addCategory(page: Page, groupName: string, name: string): Promise<void> {
  const group = page.getByRole('region', { name: `Group ${groupName}` });
  await group.getByRole('textbox', { name: `New Category in ${groupName}` }).fill(name);
  await group.getByRole('button', { name: 'Add Category' }).click();
  await expect(group.getByRole('listitem', { name, exact: true })).toBeVisible();
}

/** Opens /categories and adds a new Expense group with one Category in it. */
export async function addExpenseCategory(
  page: Page,
  groupName: string,
  categoryName: string,
): Promise<void> {
  await page.goto('/categories');
  await addCategoryGroup(page, groupName, 'Expense');
  await addCategory(page, groupName, categoryName);
}

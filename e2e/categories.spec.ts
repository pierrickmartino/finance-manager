import { expect, test } from '@playwright/test';
import { addCategory, addCategoryGroup } from './support/categories';

test('manages Category groups and Categories as master / detail', async ({ page }) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const suffix = Date.now().toString(36);
  const travel = `Travel ${suffix}`;
  const leisure = `Leisure ${suffix}`;
  const flights = `Flights ${suffix}`;
  const hotels = `Hotels ${suffix}`;
  page.on('dialog', (dialog) => dialog.accept());

  // The first group is open by default; the list shows every group by type
  await page.goto('/categories');
  const groupList = page.getByRole('navigation', { name: 'Category groups' });
  await expect(groupList.getByRole('heading', { name: 'Income' })).toBeVisible();
  await expect(groupList.getByRole('link', { name: 'Income' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // A new group opens straight away, ready for its Categories
  await addCategoryGroup(page, travel, 'Expense');
  await expect(page).toHaveURL(/\?group=/);
  await expect(groupList.getByRole('link', { name: travel })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await addCategory(page, travel, flights);
  await addCategory(page, travel, hotels);

  // Reorder within the group from the row menu
  const travelGroup = page.getByRole('region', { name: `Group ${travel}` });
  const rows = travelGroup
    .getByRole('list', { name: `Categories of ${travel}` })
    .getByRole('listitem');
  await travelGroup.getByLabel(`Actions for ${hotels}`).click();
  await travelGroup.getByRole('button', { name: 'Move up' }).click();
  await expect(rows.first()).toHaveAccessibleName(hotels);

  // Rename from the row menu
  await travelGroup.getByLabel(`Name of ${hotels}`).fill(`${hotels} and B&B`);
  await travelGroup.getByRole('button', { name: 'Rename' }).click();
  await expect(rows.first()).toHaveAccessibleName(`${hotels} and B&B`);
  await page.keyboard.press('Escape');

  // Move a Category to another group, which then lists it
  await addCategoryGroup(page, leisure, 'Expense');
  await groupList.getByRole('link', { name: travel }).click();
  await travelGroup.getByLabel(`Actions for ${flights}`).click();
  await travelGroup.getByLabel(`Move ${flights} to`).selectOption({ label: leisure });
  await travelGroup.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(travelGroup.getByRole('listitem', { name: flights })).toHaveCount(0);
  await groupList.getByRole('link', { name: leisure }).click();
  const leisureGroup = page.getByRole('region', { name: `Group ${leisure}` });
  await expect(leisureGroup.getByRole('listitem', { name: flights })).toBeVisible();

  // Merge it back into the renamed Category, which empties this group
  await leisureGroup.getByLabel(`Actions for ${flights}`).click();
  await leisureGroup
    .getByLabel(`Merge ${flights} into`)
    .selectOption({ label: `${travel} › ${hotels} and B&B` });
  await leisureGroup.getByRole('button', { name: 'Merge' }).click();
  await expect(leisureGroup.getByText('No Categories yet.')).toBeVisible();

  // An empty group can be deleted; the page falls back to the first group
  await leisureGroup.getByText('Edit group', { exact: true }).click();
  await leisureGroup.getByRole('button', { name: 'Delete group' }).click();
  await expect(groupList.getByRole('link', { name: leisure })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Group Income' })).toBeVisible();

  // Delete the remaining Category
  await groupList.getByRole('link', { name: travel }).click();
  await travelGroup.getByLabel(`Actions for ${hotels} and B&B`).click();
  await travelGroup.getByRole('button', { name: 'Delete Category' }).click();
  await expect(travelGroup.getByText('No Categories yet.')).toBeVisible();
});

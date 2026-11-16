import { expect, test, type Locator, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { addExpenseCategory } from './support/categories';
import { withServices } from './support/services';
import {
  backToList,
  detailShown,
  importUbsAccount,
  listAccount,
  NARROW,
  openTransaction,
  slowTransactionDetails,
  WIDE,
} from './support/transactions';
import { slowViewTransitions, viewTransitionMotionDuring } from './support/view-transitions';

/*
 * Stepping through the Transactions list from a Transaction detail (spec #152): Previous, Next,
 * j / k, the count, "← Transactions", deleting, and the unsaved-changes guard.
 */

test('steps through the Transactions list it was opened from with Previous and Next', async ({
  page,
}) => {
  const accountName = await importUbsAccount(page, 'Stepping');
  await page.setViewportSize(WIDE);
  const rows = await listAccount(page, accountName);
  const newest = await rows.nth(0).getByRole('link').innerText();
  const second = await rows.nth(1).getByRole('link').innerText();
  const title = page.getByRole('heading', { level: 1 });

  // Opened from the Account's list: the first of its 14, nothing before it
  await page
    .getByRole('complementary', { name: 'Transaction preview' })
    .getByRole('link', { name: 'Open & classify' })
    .click();
  await detailShown(page);
  const stepper = listStepper(page);
  await expect(stepper.getByText('1 of 14', { exact: true })).toBeVisible();
  await expect(stepper.getByRole('link', { name: 'Previous Transaction' })).toHaveCount(0);
  await expect(title).toHaveText(newest);

  // Next and Previous open the neighbouring Transactions of that list, without animation, even
  // when the next one is slow to arrive and its loading skeleton shows first
  await slowTransactionDetails(page, 1000);
  const stepping = await viewTransitionMotionDuring(page, async () => {
    await stepper.getByRole('link', { name: 'Next Transaction' }).click();
    await expect(stepper.getByText('2 of 14', { exact: true })).toBeVisible();
    await expect(title).toHaveText(second);
  });
  expect(stepping).toEqual([]);
  await stepper.getByRole('link', { name: 'Previous Transaction' }).click();
  await expect(stepper.getByText('1 of 14', { exact: true })).toBeVisible();
  await expect(title).toHaveText(newest);

  // The list is in the URL, so a reload keeps it
  await stepper.getByRole('link', { name: 'Next Transaction' }).click();
  await expect(stepper.getByText('2 of 14', { exact: true })).toBeVisible();
  await page.reload();
  await expect(stepper.getByText('2 of 14', { exact: true })).toBeVisible();

  // Opened from the oldest row: the last of the list, nothing after it
  await listAccount(page, accountName);
  await page.setViewportSize(NARROW);
  await rows.last().getByRole('link').click();
  await detailShown(page);
  await expect(stepper.getByText('14 of 14', { exact: true })).toBeVisible();
  await expect(stepper.getByRole('link', { name: 'Next Transaction' })).toHaveCount(0);
  await expect(stepper.getByRole('link', { name: 'Previous Transaction' })).toBeVisible();

  // A bare link knows no list, so it shows no navigation
  const bare = new URL(page.url());
  bare.search = '';
  await page.goto(bare.toString());
  await expect(page.getByRole('heading', { name: 'From the bank' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Transactions' })).toBeVisible();
  await expect(stepper).toHaveCount(0);
});

test('a Transaction classified out of an Unclassified list stays open and Next continues', async ({
  page,
}) => {
  const suffix = Date.now();
  const groupName = `Stepping group ${suffix}`;
  const categoryName = `Stepping category ${suffix}`;
  await addExpenseCategory(page, groupName, categoryName);
  const accountName = await importUbsAccount(page, 'Unclassified stepping');
  await page.setViewportSize(NARROW);
  await listAccount(page, accountName);
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Unclassified only').check();
  await search.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  // Rules from other specs share the E2E database, so the count is read, not assumed.
  await expect(page).toHaveURL(/unclassified=true/);
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThan(2);
  const third = await rows.nth(2).getByRole('link').innerText();
  await page.waitForLoadState('networkidle');
  await rows.nth(1).getByRole('link').click();
  await detailShown(page);
  const stepper = listStepper(page);
  await expect(stepper.getByText(`2 of ${total}`, { exact: true })).toBeVisible();
  // The count is a polite status, announced as it changes
  const count = stepper.getByRole('status');
  await expect(count).toContainText(`2 of ${total}`);

  // Classified, it no longer matches: the user stays on it and the count drops by one
  const form = page.getByRole('form', { name: 'Classification' });
  await form.getByLabel('Category').selectOption({ label: categoryName });
  await form.getByRole('button', { name: 'Save classification' }).click();
  await expect(stepper.getByText(`— of ${total - 1}`, { exact: true })).toBeVisible();
  await expect(stepper.getByText('No longer matches this list')).toBeVisible();
  await expect(count).toContainText(`— of ${total - 1}`);
  await expect(count).toContainText('No longer matches this list');
  const classifiedUrl = page.url();

  // Next goes on to its neighbour among those still matching
  await stepper.getByRole('link', { name: 'Next Transaction' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(third);
  await expect(stepper.getByText(`2 of ${total - 1}`, { exact: true })).toBeVisible();
  await expect(stepper.getByText('No longer matches this list')).toHaveCount(0);
  const thirdId = new URL(page.url()).pathname.split('/').pop();

  // "← Transactions" from the one no longer in the list selects that same neighbour, on its page
  await page.goto(classifiedUrl);
  await expect(stepper.getByText('No longer matches this list')).toBeVisible();
  await backToList(page);
  await expect(page).toHaveURL(/\/transactions\?/);
  const listUrl = new URL(page.url());
  expect(listUrl.searchParams.get('unclassified')).toBe('true');
  expect(listUrl.searchParams.get('page')).toBeNull();
  expect(listUrl.searchParams.get('selected')).toBe(thirdId);
  await expect(rows).toHaveCount(total - 1);
});

test('j and k step through the Transactions list, but never while typing in a field', async ({
  page,
}) => {
  const accountName = await importUbsAccount(page, 'Keys');
  await page.setViewportSize(NARROW);
  const rows = await listAccount(page, accountName);
  const newest = await rows.nth(0).getByRole('link').innerText();
  const second = await rows.nth(1).getByRole('link').innerText();
  const title = page.getByRole('heading', { level: 1 });
  const stepper = listStepper(page);
  const position = (text: string) => stepper.getByText(text, { exact: true });

  // The last of the list: j has nowhere to go, k steps back
  await rows.last().getByRole('link').click();
  await detailShown(page);
  await expect(position('14 of 14')).toBeVisible();
  const oldest = await title.innerText();
  await page.keyboard.press('j');
  await expect(position('14 of 14')).toBeVisible();
  await expect(title).toHaveText(oldest);
  await page.keyboard.press('k');
  await expect(position('13 of 14')).toBeVisible();

  // The first of the list: k has nowhere to go, j steps on; the buttons show their keys
  await listAccount(page, accountName);
  await rows.nth(0).getByRole('link').click();
  await detailShown(page);
  await expect(position('1 of 14')).toBeVisible();
  await expect(stepper.getByText('k', { exact: true })).toBeVisible();
  await expect(
    stepper.getByRole('link', { name: 'Next Transaction' }).getByText('j', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('k');
  await expect(position('1 of 14')).toBeVisible();
  await page.keyboard.press('j');
  await expect(position('2 of 14')).toBeVisible();
  await expect(title).toHaveText(second);
  await page.keyboard.press('k');
  await expect(position('1 of 14')).toBeVisible();
  await expect(title).toHaveText(newest);

  // With a modifier held, the keys are the browser's
  for (const chord of ['Control+j', 'Alt+j', 'Meta+j', 'Shift+J']) {
    await page.keyboard.press(chord);
  }
  await expect(position('1 of 14')).toBeVisible();

  // Typing in the Payee, Tags or Notes field, or in a Split line, never navigates
  const url = page.url();
  const classification = page.getByRole('form', { name: 'Classification' });
  await classification.getByLabel('Payee').pressSequentially('jk');
  await classification.getByLabel('Tags').pressSequentially('jk');
  await classification.getByLabel('Notes').pressSequentially('jk');
  await page.getByText('Split Transaction', { exact: true }).click();
  const line = page.getByRole('form', { name: 'Split' }).getByLabel('Note of line 1');
  await line.pressSequentially('jk');
  await expect(classification.getByLabel('Payee')).toHaveValue(/jk$/);
  await expect(classification.getByLabel('Notes')).toHaveValue(/jk$/);
  await expect(line).toHaveValue(/jk$/);
  await expect(position('1 of 14')).toBeVisible();
  expect(page.url()).toBe(url);

  // A bare link knows no list, so j and k do nothing
  const bare = new URL(url);
  bare.search = '';
  await page.goto(bare.toString());
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('j');
  await expect(title).toHaveText(newest);
  expect(page.url()).toBe(bare.toString());
});

test('j steps on as soon as the Transaction detail shows, while its morph still runs', async ({
  page,
}) => {
  const suffix = Date.now();
  const accountId = await seedLongAccount(suffix, 3);
  await page.setViewportSize(NARROW);
  await page.goto(`/transactions?accountId=${accountId}`);
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await page.waitForLoadState('networkidle');
  // The row morphs into the loading skeleton, then the skeleton into the page: the detail
  // arrives after the first morph has ended, and the page shows while the second still runs.
  await slowViewTransitions(page, 1000);
  await slowTransactionDetails(page, 2000);

  await rows.first().getByRole('link').click();
  const stepper = listStepper(page);
  await expect(stepper.getByText('1 of 3', { exact: true })).toBeVisible();
  await page.keyboard.press('j');
  await expect(stepper.getByText('2 of 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(longItemName(2, suffix));
});

test('unsaved classification edits are never lost or saved by stepping through the list', async ({
  page,
}) => {
  const accountName = await importUbsAccount(page, 'Unsaved');
  await page.setViewportSize(NARROW);
  const rows = await listAccount(page, accountName);
  const title = page.getByRole('heading', { level: 1 });
  const stepper = listStepper(page);
  const position = (text: string) => stepper.getByText(text, { exact: true });
  const classification = page.getByRole('form', { name: 'Classification' });
  const notes = classification.getByLabel('Notes');

  await rows.nth(0).getByRole('link').click();
  await detailShown(page);
  await expect(position('1 of 14')).toBeVisible();
  const newest = await title.innerText();

  // A changed note, then Next: asked first; staying keeps the edit as it was
  await notes.fill('Half-written note');
  const dismissed = nextDialog(page, 'dismiss');
  await stepper.getByRole('link', { name: 'Next Transaction' }).click();
  expect(await dismissed).toBe('Discard unsaved changes?');
  await expect(notes).toHaveValue('Half-written note');
  await expect(position('1 of 14')).toBeVisible();
  await expect(title).toHaveText(newest);

  // Confirming leaves, and nothing was saved on the way
  const accepted = nextDialog(page, 'accept');
  await stepper.getByRole('link', { name: 'Next Transaction' }).click();
  expect(await accepted).toBe('Discard unsaved changes?');
  await expect(position('2 of 14')).toBeVisible();
  await stepper.getByRole('link', { name: 'Previous Transaction' }).click();
  await expect(position('1 of 14')).toBeVisible();
  await expect(notes).toHaveValue('');
});

test('j, k, "← Transactions" and the browser ask before discarding a changed Category or Split, until it is saved', async ({
  page,
}) => {
  const accountName = await importUbsAccount(page, 'Guarded');
  const groceries = `Groceries ${Date.now()}`;
  await addExpenseCategory(page, `Food ${Date.now()}`, groceries);
  await page.setViewportSize(NARROW);
  const rows = await listAccount(page, accountName);
  const stepper = listStepper(page);
  const position = (text: string) => stepper.getByText(text, { exact: true });
  const classification = page.getByRole('form', { name: 'Classification' });
  const category = classification.getByLabel('Category');

  await rows.nth(1).getByRole('link').click();
  await detailShown(page);
  await expect(position('2 of 14')).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Nothing changed: stepping goes without a word
  const quiet = recordDialogs(page);
  await stepTo(page, 'Next', '3 of 14');
  await stepTo(page, 'Previous', '2 of 14');
  expect(quiet).toEqual([]);
  page.removeAllListeners('dialog');

  // A changed Category: j, k, "← Transactions" and the browser's back each ask, and staying
  // keeps it, on this Transaction
  const detailUrl = page.url();
  await category.selectOption({ label: groceries });
  await category.blur();
  for (const leave of [
    () => page.keyboard.press('j'),
    () => page.keyboard.press('k'),
    () => page.getByRole('link', { name: '← Transactions' }).click(),
    // Staying cancels the back, so it never navigates: not waited for
    () => void page.goBack().catch(() => null),
  ]) {
    const asked = nextDialog(page, 'dismiss');
    await leave();
    expect(await asked).toBe('Discard unsaved changes?');
    await expect(page).toHaveURL(detailUrl);
    await expect(position('2 of 14')).toBeVisible();
    await expect(category.locator('option:checked')).toHaveText(groceries);
  }

  // Reloading or closing the tab warns too
  const unload = nextDialog(page, 'dismiss', 'beforeunload');
  await page.close({ runBeforeUnload: true });
  await unload;
  expect(page.isClosed()).toBe(false);

  // Once saved, leaving no longer asks, and the saved Category stays
  await classification.getByRole('button', { name: 'Save classification' }).click();
  await expect(classification.getByText('Saved.')).toBeVisible();
  const saved = recordDialogs(page);
  await stepTo(page, 'Next', '3 of 14');
  await stepTo(page, 'Previous', '2 of 14');
  await expect(category.locator('option:checked')).toHaveText(groceries);
  expect(saved).toEqual([]);
  page.removeAllListeners('dialog');

  // A changed Split draft asks the same way; confirming the browser's back leaves it
  const splitNote = page.getByRole('form', { name: 'Split' }).getByLabel('Note of line 1');
  const changeSplit = async () => {
    await page.getByText('Split Transaction', { exact: true }).click();
    await splitNote.fill('Half a Split');
  };
  await changeSplit();
  const split = nextDialog(page, 'dismiss');
  await stepper.getByRole('link', { name: 'Next Transaction' }).click();
  expect(await split).toBe('Discard unsaved changes?');
  await expect(position('2 of 14')).toBeVisible();
  const back = nextDialog(page, 'accept');
  await page.goBack();
  expect(await back).toBe('Discard unsaved changes?');
  await expect(position('3 of 14')).toBeVisible();

  // So does confirming "← Transactions"
  await page.goForward();
  await expect(position('2 of 14')).toBeVisible();
  await changeSplit();
  const confirmed = nextDialog(page, 'accept');
  await page.getByRole('link', { name: '← Transactions' }).click();
  expect(await confirmed).toBe('Discard unsaved changes?');
  await expect(page).toHaveURL(/\/transactions\?/);

  // With nothing unsaved, the tab closes without a warning
  const closing = recordDialogs(page);
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(closing).toEqual([]);
});

test('"← Transactions" returns to the list page holding the Transaction, with it selected', async ({
  page,
}) => {
  const suffix = Date.now();
  const accountId = await seedLongAccount(suffix);
  const item = (n: number) => longItemName(n, suffix);
  await page.setViewportSize(WIDE);
  const preview = page.getByRole('complementary', { name: 'Transaction preview' });
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');

  // Opened from page 1: its last Transaction is the 50th of 52, and Next steps past it
  await page.goto(`/transactions?accountId=${accountId}`);
  await expect(rows).toHaveCount(50);
  await page.waitForLoadState('networkidle');
  await rows
    .filter({ hasText: item(3) })
    .getByRole('link')
    .click();
  await expect(preview).toContainText(item(3));
  await preview.getByRole('link', { name: 'Open & classify' }).click();
  // A Manual transaction's detail has no bank fields: wait for its title instead
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText(item(3));
  const stepper = listStepper(page);
  await expect(stepper.getByText('50 of 52', { exact: true })).toBeVisible();
  await stepper.getByRole('link', { name: 'Next Transaction' }).click();
  await expect(stepper.getByText('51 of 52', { exact: true })).toBeVisible();

  // The list is in the detail URL, so a reload keeps where "← Transactions" returns to
  await page.reload();
  await expect(stepper.getByText('51 of 52', { exact: true })).toBeVisible();
  const detailPath = new URL(page.url()).pathname;

  // Page 2 of the Account's list, the Transaction now open selected in the preview
  await backToList(page);
  await expect(page).toHaveURL(/\/transactions\?.*page=2/);
  expect(new URL(page.url()).searchParams.get('accountId')).toBe(accountId);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: item(2) }).getByRole('link')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(preview).toContainText(item(2));

  // A bare detail URL knows no list: back to the bare Transactions list
  await page.goto(detailPath);
  await expect(title).toHaveText(item(2));
  await expect(page.getByRole('link', { name: '← Transactions' })).toHaveAttribute(
    'href',
    '/transactions',
  );
});

test('deleting a Transaction opened from a list returns to that list, its neighbour selected', async ({
  page,
}) => {
  const suffix = Date.now();
  const accountId = await seedLongAccount(suffix);
  const item = (n: number) => longItemName(n, suffix);
  await page.setViewportSize(WIDE);
  const preview = page.getByRole('complementary', { name: 'Transaction preview' });
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  const title = page.getByRole('heading', { level: 1 });
  const stepper = listStepper(page);
  const listOf = (account: string) => `/transactions?accountId=${account}`;
  const openFromList = async (url: string, name: string, position: string) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await openTransaction(page, rows.filter({ hasText: name }));
    await expect(title).toHaveText(name);
    await expect(stepper.getByText(position, { exact: true })).toBeVisible();
  };
  const listParam = (name: string) => new URL(page.url()).searchParams.get(name);
  const selectedIs = async (n: number) => {
    await expect(rows.filter({ hasText: item(n) }).getByRole('link')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(preview).toContainText(item(n));
  };

  // The 50th of 52: back on page 1 of the Account's list, the next one (now 50th) selected
  await openFromList(listOf(accountId), item(3), '50 of 52');
  await deleteTransaction(page);
  await expect(rows).toHaveCount(50);
  expect(listParam('accountId')).toBe(accountId);
  expect(listParam('page')).toBeNull();
  await expect(rows.filter({ hasText: item(3) })).toHaveCount(0);
  await selectedIs(2);

  // The last of the list: the previous one selected, on its page
  await openFromList(`${listOf(accountId)}&page=2`, item(1), '51 of 51');
  await deleteTransaction(page);
  await expect(rows).toHaveCount(50);
  expect(listParam('accountId')).toBe(accountId);
  await selectedIs(2);

  // A bare detail URL knows no list: back to the bare Transactions list
  await openFromList(listOf(accountId), item(52), '1 of 50');
  await page.goto(new URL(page.url()).pathname);
  await expect(title).toHaveText(item(52));
  await deleteTransaction(page);
  await expect(page).toHaveURL(/\/transactions$/);

  // The only Transaction of its list: that list, still filtered, now empty
  const lone = Date.now();
  const loneAccountId = await seedLongAccount(lone, 1);
  await openFromList(listOf(loneAccountId), longItemName(1, lone), '1 of 1');
  await deleteTransaction(page);
  await expect(page.getByText('No Transactions match.')).toBeVisible();
  expect(listParam('accountId')).toBe(loneAccountId);
  expect(listParam('selected')).toBeNull();
});

/** Deletes the Transaction open on its detail, confirming, and waits for the list. */
async function deleteTransaction(page: Page): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete Transaction' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
}

/** More than a page of the list (50 rows), so there is a second page. */
const LONG_SEEDED = 52;

const longItemName = (n: number, suffix: number) => `Long ${String(n).padStart(2, '0')} ${suffix}`;

/**
 * An Account with `count` (52 by default) manual Transactions, "Long 01" oldest to "Long 52"
 * newest (one per day).
 */
async function seedLongAccount(suffix: number, count = LONG_SEEDED): Promise<string> {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Long bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Long account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2024-01-01',
    });
    for (let n = 1; n <= count; n += 1) {
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: new Date(Date.UTC(2025, 0, n)).toISOString().slice(0, 10),
        amountMinor: -n * 100,
        description: longItemName(n, suffix),
      });
    }
    return account.id;
  });
}

/** Previous, the position and Next on a Transaction detail opened from the Transactions list. */
function listStepper(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Transactions list' });
}

/** Collects every dialog's message from now on, dismissing each one. */
function recordDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  return messages;
}

/** Steps to the Previous or Next Transaction by its link and waits for its `position`. */
async function stepTo(page: Page, step: 'Previous' | 'Next', position: string): Promise<void> {
  const stepper = listStepper(page);
  await stepper.getByRole('link', { name: `${step} Transaction` }).click();
  await expect(stepper.getByText(position, { exact: true })).toBeVisible();
}

/** Answers the next dialog of `type` the page opens and resolves with its message. */
function nextDialog(
  page: Page,
  answer: 'accept' | 'dismiss',
  type: 'confirm' | 'beforeunload' = 'confirm',
): Promise<string> {
  return new Promise((resolve, reject) => {
    page.once('dialog', (dialog) => {
      if (dialog.type() !== type) {
        reject(new Error(`Expected a ${type} dialog, got ${dialog.type()}`));
        return;
      }
      const message = dialog.message();
      void (answer === 'accept' ? dialog.accept() : dialog.dismiss()).then(() => resolve(message));
    });
  });
}

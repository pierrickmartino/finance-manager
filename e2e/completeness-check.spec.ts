import { expect, test } from '@playwright/test';
import { archiveAccount, createAccount, listAccounts } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { recordBalanceSnapshot } from '../src/server/services/balance-snapshots';
import { checkCompleteness } from '../src/server/services/completeness';
import type { ServiceContext } from '../src/server/services/context';
import { createDashboard, deleteDashboard } from '../src/server/services/dashboards';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { commitImport, previewImport } from '../src/server/services/imports';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/** A CHF CAMT.053 statement with no IBAN, one booked entry, covering `from` to `to`. */
function camtFile(from: string, to: string): { fileName: string; content: Uint8Array } {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <FrToDt><FrDtTm>${from}T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt>
    <Acct><Ccy>CHF</Ccy></Acct>
    <Ntry>
      <Amt Ccy="CHF">12.50</Amt><CdtDbtInd>DBIT</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><DtTm>${from}T10:00:00</DtTm></BookgDt>
      <AcctSvcrRef>COMPLETENESS-${from}</AcctSvcrRef>
      <AddtlNtryInf>Paiement</AddtlNtryInf>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`;
  return { fileName: 'completeness.xml', content: new TextEncoder().encode(xml) };
}

/**
 * Archives every Account the check lists now, so the test controls every checked Account: the
 * E2E database is shared by the run, and earlier specs leave imported Accounts whose data is
 * Stale by now. Returns their ids, for `restoreAccounts`.
 */
async function setAsideCheckedAccounts(ctx: ServiceContext): Promise<string[]> {
  const entries = await checkCompleteness(ctx, { today: swissToday() });
  const ids = entries.map((entry) => entry.account.id);
  for (const id of ids) await archiveAccount(ctx, id);
  return ids;
}

/**
 * Un-archives the Accounts `setAsideCheckedAccounts` archived, leaving other specs' data as it
 * found it. No service un-archives an Account, so this clean-up is SQL.
 */
async function restoreAccounts(ctx: ServiceContext, ids: string[]): Promise<void> {
  await ctx.db.query('UPDATE account SET archived_at = NULL WHERE id = ANY($1::uuid[])', [ids]);
}

/** A CHF Account with an Import format and, until something is imported, no data. */
function importedAccount(ctx: ServiceContext, bankId: string, name: string) {
  return createAccount(ctx, {
    bankId,
    name,
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'camt053',
    openingBalanceMinor: 0,
  });
}

test('the home Dashboard shows the Completeness check: one line when current, open on a problem', async ({
  page,
}) => {
  const suffix = Date.now();
  const bankName = `Completeness ${suffix}`;
  const setAside = await withServices(setAsideCheckedAccounts);
  try {
    await withServices(async (ctx) => {
      const bank = await createBank(ctx, { name: bankName });
      const current = await importedAccount(ctx, bank.id, `Current ${suffix}`);
      const today = swissToday();
      const preview = await previewImport(ctx, {
        accountId: current.id,
        ...camtFile(addDays(today, -30), addDays(today, -2)),
      });
      await commitImport(ctx, { previewId: preview.id });
    });

    await page.goto('/');
    const notice = page.getByRole('region', { name: 'Completeness check' });
    await expect(notice).toContainText(/^1 Account current to \d{2}\.\d{2}\.\d{4}/);
    await expect(page.getByRole('alert', { name: 'Completeness check' })).toHaveCount(0);
    // Collapsed: the per-Account list is there, but closed.
    await expect(notice.getByRole('link', { name: new RegExp(`Current ${suffix}`) })).toBeHidden();

    await withServices(async (ctx) => {
      const [bank] = (await listAccounts(ctx)).filter((account) => account.bankName === bankName);
      await importedAccount(ctx, bank!.bankId, `Spare ${suffix}`);
      // A manual-only Account is listed only for a mismatch: its snapshot says CHF 20 less.
      const cash = await createAccount(ctx, {
        bankId: bank!.bankId,
        name: `Cash ${suffix}`,
        currency: 'CHF',
        iban: null,
        kind: 'current',
        importFormat: null,
        openingBalanceMinor: 0,
      });
      const today = swissToday();
      await createManualTransaction(ctx, {
        accountId: cash.id,
        bookingDate: addDays(today, -5),
        amountMinor: 10_000,
        description: 'Cash withdrawal',
      });
      await recordBalanceSnapshot(ctx, {
        accountId: cash.id,
        date: addDays(today, -1),
        balanceMinor: 8_000,
      });
    });

    await page.reload();
    const problems = page.getByRole('alert', { name: 'Completeness check' });
    await expect(problems).toContainText('2 Accounts need attention');
    const mismatchRow = problems.getByRole('link', { name: new RegExp(`Cash ${suffix}`) });
    await expect(mismatchRow).toContainText(/Mismatch of CHF.*20\.00/);
    await expect(mismatchRow).not.toContainText('Data ends');
    const problemRow = problems.getByRole('link', { name: new RegExp(`Spare ${suffix}`) });
    await expect(problemRow).toContainText('No Import yet');
    await expect(
      problems.getByRole('link', { name: new RegExp(`Current ${suffix}`) }),
    ).toBeVisible();

    await problemRow.click();
    await expect(page.getByRole('heading', { name: `Spare ${suffix}`, level: 1 })).toBeVisible();
  } finally {
    await withServices((ctx) => restoreAccounts(ctx, setAside));
  }
});

test('a Dashboard other than the home one shows no Completeness check', async ({ page }) => {
  const suffix = Date.now();
  const other = await withServices(async (ctx) => {
    // An Account with no Import yet, so the home Dashboard has something to show.
    const bank = await createBank(ctx, { name: `Completeness other ${suffix}` });
    await importedAccount(ctx, bank.id, `Unimported ${suffix}`);
    return createDashboard(ctx, { name: `Other ${suffix}` });
  });
  try {
    await page.goto('/');
    // An alert when it lists a problem, a region otherwise: find it by its name alone.
    await expect(page.getByLabel('Completeness check')).toBeVisible();

    await page.goto(`/dashboards/${other.id}`);
    await expect(page.getByRole('heading', { name: `Other ${suffix}`, level: 1 })).toBeVisible();
    await expect(page.getByLabel('Completeness check')).toHaveCount(0);
  } finally {
    await withServices((ctx) => deleteDashboard(ctx, other.id));
  }
});

import { expect, test } from '@playwright/test';
import { createDb } from '../src/server/db/client';
import { archiveAccount, createAccount, listAccounts } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import type { ServiceContext } from '../src/server/services/context';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { commitImport, previewImport } from '../src/server/services/imports';
import { databaseUrl } from '../test/support/postgres';

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

/** Runs `seed` against the E2E database through the services. */
async function withServices(seed: (ctx: ServiceContext) => Promise<void>): Promise<void> {
  const db = createDb(databaseUrl(process.env.E2E_DATABASE_NAME!));
  try {
    await seed({ db, actor: { type: 'manual', id: null } });
  } finally {
    await db.end();
  }
}

test('the home Dashboard shows the Completeness check: one line when current, open on a problem', async ({
  page,
}) => {
  const suffix = Date.now();
  const bankName = `Completeness ${suffix}`;
  // The E2E database is shared by the run, and earlier specs leave imported Accounts whose
  // 2025 data is Stale by now: archive them, so this test controls every checked Account.
  await withServices(async (ctx) => {
    for (const account of await listAccounts(ctx)) {
      if (account.archivedAt === null && account.importFormat !== null) {
        await archiveAccount(ctx, account.id);
      }
    }
    const bank = await createBank(ctx, { name: bankName });
    const current = await createAccount(ctx, {
      bankId: bank.id,
      name: `Current ${suffix}`,
      currency: 'CHF',
      iban: null,
      kind: 'current',
      importFormat: 'camt053',
      openingBalanceMinor: 0,
    });
    const today = swissToday();
    const preview = await previewImport(ctx, {
      accountId: current.id,
      ...camtFile(addDays(today, -30), addDays(today, -2)),
    });
    await commitImport(ctx, { previewId: preview.id });
  });

  await page.goto('/');
  const notice = page.getByRole('region', { name: 'Completeness check' });
  await expect(notice).toContainText(/^All 1 Account current to \d{2}\.\d{2}\.\d{4}/);
  await expect(page.getByRole('alert', { name: 'Completeness check' })).toHaveCount(0);
  // Collapsed: the per-Account list is there, but closed.
  await expect(notice.getByRole('link', { name: new RegExp(`Current ${suffix}`) })).toBeHidden();

  await withServices(async (ctx) => {
    const [bank] = (await listAccounts(ctx)).filter((account) => account.bankName === bankName);
    await createAccount(ctx, {
      bankId: bank!.bankId,
      name: `Spare ${suffix}`,
      currency: 'CHF',
      iban: null,
      kind: 'savings',
      importFormat: 'camt053',
      openingBalanceMinor: 0,
    });
  });

  await page.reload();
  const problems = page.getByRole('alert', { name: 'Completeness check' });
  await expect(problems).toContainText('1 Account needs attention');
  const problemRow = problems.getByRole('link', { name: new RegExp(`Spare ${suffix}`) });
  await expect(problemRow).toContainText('No Import yet');
  await expect(problems.getByRole('link', { name: new RegExp(`Current ${suffix}`) })).toBeVisible();

  await problemRow.click();
  await expect(page.getByRole('heading', { name: `Spare ${suffix}`, level: 1 })).toBeVisible();
});

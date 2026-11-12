import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { commitImport, previewImport } from '../src/server/services/imports';
import { editClassification } from '../src/server/services/transactions';
import { withServices } from './support/services';

/** A CHF CAMT.053 statement with no IBAN and one CHF 21.90 debit on each of `dates`. */
function camtFile(dates: string[], suffix: number): { fileName: string; content: Uint8Array } {
  const entries = dates.map(
    (date) => `<Ntry>
      <Amt Ccy="CHF">21.90</Amt><CdtDbtInd>DBIT</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><DtTm>${date}T10:00:00</DtTm></BookgDt>
      <AcctSvcrRef>RECURRING-${suffix}-${date}</AcctSvcrRef>
      <AddtlNtryInf>Streaming subscription</AddtlNtryInf>
    </Ntry>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Acct><Ccy>CHF</Ccy></Acct>
    ${entries.join('\n')}
  </Stmt></BkToCstmrStmt>
</Document>`;
  return { fileName: 'recurring.xml', content: new TextEncoder().encode(xml) };
}

test('the Recurring payments page lists a monthly charge with its yearly cost', async ({
  page,
}) => {
  const suffix = Date.now();
  const payeeName = `Streamflix ${suffix}`;
  const today = swissToday();
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Recurring ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      name: `Card ${suffix}`,
      currency: 'CHF',
      iban: null,
      kind: 'current',
      importFormat: 'camt053',
      openingBalanceMinor: 0,
    });
    const group = await createCategoryGroup(ctx, { name: `Leisure ${suffix}`, type: 'expense' });
    const category = await createCategory(ctx, { groupId: group.id, name: 'Streaming' });
    const dates = [addDays(today, -65), addDays(today, -35), addDays(today, -5)];
    const preview = await previewImport(ctx, { accountId: account.id, ...camtFile(dates, suffix) });
    const imported = await commitImport(ctx, { previewId: preview.id });
    const rows = await ctx.db.query<{ id: string }>(
      'SELECT id FROM "transaction" WHERE import_id = $1',
      [imported.id],
    );
    for (const { id } of rows.rows) {
      await editClassification(ctx, id, { payeeName, categoryId: category.id });
    }
  });

  await page.goto('/recurring-payments');

  await expect(page.getByRole('heading', { level: 1, name: 'Recurring payments' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Yearly cost' })).toBeVisible();
  const row = page.getByRole('list', { name: 'Recurring payments' }).getByRole('listitem').filter({
    hasText: payeeName,
  });
  await expect(row).toContainText('Monthly');
  await expect(row).toContainText('CHF 262.80');
  await expect(row).toContainText('CHF 21.90 × 12');
  await expect(row).toContainText(/Next around \d{1,2} [A-Z][a-z]+/);
});

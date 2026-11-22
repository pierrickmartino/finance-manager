import { expect, vi } from 'vitest';
import { originFromParams } from '@/lib/reporting/drill-origin';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { cellFromParams, queryFromParams } from '@/lib/reporting/widget-params';
import { createAccount, type Account } from '@/server/services/accounts';
import { createBank } from '@/server/services/banks';
import type { Span } from '@/lib/analytics/span';
import { loadAnalytics, type AnalyticsSections } from '@/server/services/analytics';
import type { ServiceContext } from '@/server/services/context';
import { listCellTransactions, type CellTransactionPage } from '@/server/services/reporting';
import { editClassification, type ClassificationChanges } from '@/server/services/transactions';
import { seedTransactions, type SeedTransaction } from './transactions';

/**
 * Shared seeding for the Analytics service's tests (src/server/services/analytics): an Account
 * per Bank, and Transactions classified as they are seeded. Each section's test file builds its
 * own dataset from these.
 */

/** Fixes "today" (the Swiss date the reporting engine reads) for the rest of the test. */
export function fixToday(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${date}T09:00:00Z`) });
}

/** A current Account at its own Bank, with no opening balance. */
export async function seedAccount(
  ctx: ServiceContext,
  name: string,
  currency = 'CHF',
): Promise<Account> {
  const bank = await createBank(ctx, { name: `Bank ${name}` });
  return createAccount(ctx, {
    bankId: bank.id,
    name,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

export interface ClassifiedRow extends SeedTransaction {
  classify?: ClassificationChanges;
}

/** Seeds Transactions and classifies the ones that say how. Returns their ids in order. */
export async function seedClassified(
  ctx: ServiceContext,
  on: Account,
  rows: ClassifiedRow[],
): Promise<string[]> {
  const ids = await seedTransactions(ctx.db, on, rows);
  for (const [index, row] of rows.entries()) {
    if (row.classify) await editClassification(ctx, ids[index]!, row.classify);
  }
  return ids;
}

/**
 * One section of Analytics over a Span, once every section has loaded: the page starts
 * them all, and none may outlive the test (its database is dropped after it).
 */
export async function loadSection<Name extends keyof AnalyticsSections>(
  ctx: ServiceContext,
  span: Span,
  name: Name,
): Promise<Awaited<AnalyticsSections[Name]>> {
  const { sections } = await loadAnalytics(ctx, span);
  await Promise.allSettled(Object.values(sections));
  return await sections[name];
}

/** A URL's parameters as the page reads them: a repeated one as a list. */
function paramsOf(href: string): Record<string, string | string[]> {
  const url = new URL(href, 'http://localhost');
  const params: Record<string, string | string[]> = {};
  for (const name of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(name);
    params[name] = values.length === 1 ? values[0]! : values;
  }
  return params;
}

/** Opens a Drill-down link as its page does: its query and its cell, read from the URL. */
export async function openDrill(
  ctx: ServiceContext,
  href: string | null | undefined,
): Promise<CellTransactionPage> {
  expect(href).toMatch(/^\/widgets\/drill\?/);
  const params = paramsOf(href!);
  return listCellTransactions(ctx, queryFromParams(params), cellFromParams(params));
}

/** Where a Drill-down link leads back to. */
export const originOf = (href: string) => originFromParams(paramsOf(href));

/** Every value a card's data holds with its link: cells, row and column totals, the total. */
export function linkedValues(data: ChartSource): { value: number | null; href: string }[] {
  return [
    ...data.cells.flatMap((row, r) =>
      row.map((value, c) => ({ value, href: data.hrefs.cells[r]![c]! })),
    ),
    ...data.rowTotals.map((value, r) => ({ value, href: data.hrefs.rowTotals[r]! })),
    ...data.columnTotals.map((value, c) => ({ value, href: data.hrefs.columnTotals[c]! })),
    { value: data.total, href: data.hrefs.total },
  ];
}

/** A card's labels, one per row or column header. */
export const labels = (headers: readonly { label: string }[]) =>
  headers.map((header) => header.label);

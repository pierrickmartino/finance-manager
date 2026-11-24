import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixToday,
  loadSection,
  openDrill,
  originOf,
  seedAccount,
  seedClassified,
  seedEarlyStart,
} from '@test/support/analytics';
import { MONTHLY, YEARLY } from '@test/support/periods';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { presetPeriod } from '@/lib/analytics/period';
import { cardFrame, readCard, type CardMark, type FlowPoint } from '@/lib/reporting/card';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { splitTransaction } from '../transactions';
import { linkTransfer, splitLineSide, transactionSide } from '../transfers';

/**
 * Analytics' Income vs. expense Card (spec #270, ADR-0020): the Income and Expense Category
 * groups as running totals day by day over the Period, drawn as a line Widget's two areas.
 */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

const ROLLING_30 = presetPeriod('rolling-30-days');

/**
 * Today is 20 March 2025; Last 30 days reads from 19 February. A salary on 25 February;
 * groceries on 20 February, an EUR purchase on 21 February, a refund on 1 March, a split purchase
 * on 3 March (part groceries, part property, part a Transfer to Savings), groceries today; a property purchase (Capital), an
 * Unclassified purchase and a Transfer classified as Salary, all left out; groceries on
 * 10 February, before the Period.
 */
async function dataset(): Promise<void> {
  const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const capital = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
  const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
  const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
  const property = await createCategory(t.ctx, { groupId: capital.id, name: 'Property' });
  const as = (category: Category) => ({ categoryId: category.id });

  const ubs = await seedAccount(t.ctx, 'UBS');
  await seedEarlyStart(t.ctx, ubs);
  const ca = await seedAccount(t.ctx, 'CA', 'EUR');
  await seedEurRates(t.ctx, [['2025-02-21', '0.9400']]);

  const [, , , split, , , transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-02-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-02-20', amountMinor: -12_000, classify: as(groceries) },
    { bookingDate: '2025-03-01', amountMinor: 2_000, classify: as(groceries) },
    { bookingDate: '2025-03-03', amountMinor: -30_000 },
    { bookingDate: '2025-03-05', amountMinor: -500_000, classify: as(property) },
    { bookingDate: '2025-03-06', amountMinor: -7_000 },
    { bookingDate: '2025-03-10', amountMinor: -100_000, classify: as(salary) },
    { bookingDate: '2025-03-20', amountMinor: -5_000, classify: as(groceries) },
    { bookingDate: '2025-02-10', amountMinor: -999, classify: as(groceries) },
  ]);
  // Its third line moves money to Savings: a Split-line Transfer.
  const lines = await splitTransaction(t.ctx, split!, [
    { amountMinor: -20_000, categoryId: groceries.id },
    { amountMinor: -6_000, categoryId: property.id },
    { amountMinor: -4_000, categoryId: groceries.id },
  ]);
  const savings = await seedAccount(t.ctx, 'Savings');
  const [lineCredit] = await seedClassified(t.ctx, savings, [
    { bookingDate: '2025-03-03', amountMinor: 4_000, classify: as(salary) },
  ]);
  await linkTransfer(t.ctx, {
    sides: [splitLineSide(lines.splitLines[2]!.id), transactionSide(lineCredit!)],
  });
  const [, transferIn] = await seedClassified(t.ctx, ca, [
    // EUR -100.00 at 0.94: CHF -94.00.
    { bookingDate: '2025-02-21', amountMinor: -10_000, classify: as(groceries) },
    { bookingDate: '2025-03-10', amountMinor: 100_000 },
  ]);
  await linkTransfer(t.ctx, {
    sides: [transactionSide(transferOut!), transactionSide(transferIn!)],
  });
}

const money = String;

function areasOf(mark: CardMark): { isRunning: boolean; points: FlowPoint[] } {
  if (mark.type !== 'areas') throw new Error(`Expected areas, got ${mark.type}`);
  return mark;
}

/** A point's key and its running income and expense. */
const figures = (points: readonly FlowPoint[]) =>
  points.map((point) => [point.key, point.income, point.expense]);

describe('Income vs. expense', () => {
  it('draws the Period day by day as running totals of Income and Expense, today to date', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');
    const reading = readCard(card, money);
    const { isRunning, points } = areasOf(reading.mark);

    expect(card.name).toBe('Income vs. expense');
    expect(card.isEmpty).toBe(false);
    expect(isRunning).toBe(true);
    expect(points).toHaveLength(30);
    expect(points[0]).toMatchObject({ key: '2025-02-19', isPartial: false });
    expect(points.at(-1)).toMatchObject({ key: '2025-03-20', isPartial: true });
    expect(points.filter((point) => point.isPartial)).toHaveLength(1);
    // Groceries -120.00, EUR -100.00 at 0.94, salary 6000.00, a refund of 20.00, the split's
    // groceries -200.00 (its property part is Capital), groceries -50.00 today. Capital, the
    // Unclassified purchase and the Transfer count nowhere; quiet days stay flat.
    const at = (key: string) => figures(points).find(([pointKey]) => pointKey === key);
    expect(at('2025-02-19')).toEqual(['2025-02-19', 0, 0]);
    expect(at('2025-02-20')).toEqual(['2025-02-20', 0, 12_000]);
    expect(at('2025-02-21')).toEqual(['2025-02-21', 0, 21_400]);
    expect(at('2025-02-24')).toEqual(['2025-02-24', 0, 21_400]);
    expect(at('2025-02-25')).toEqual(['2025-02-25', 600_000, 21_400]);
    expect(at('2025-03-01')).toEqual(['2025-03-01', 600_000, 19_400]);
    expect(at('2025-03-03')).toEqual(['2025-03-03', 600_000, 39_400]);
    expect(at('2025-03-10')).toEqual(['2025-03-10', 600_000, 39_400]);
    expect(at('2025-03-19')).toEqual(['2025-03-19', 600_000, 39_400]);
    expect(at('2025-03-20')).toEqual(['2025-03-20', 600_000, 44_400]);
  });

  it('says "Profit" with "Came in" and "Went out", each what its Drill-down works out', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');
    const { lead, facts } = readCard(card, money);

    expect(lead).toMatchObject({ headline: 'Profit', detail: '555600' });
    expect(facts.map(({ label, value }) => [label, value])).toEqual([
      ['Came in', '600000'],
      ['Went out', '44400'],
    ]);
    expect((await openDrill(t.ctx, lead!.href)).value).toBe(555_600);
    expect((await openDrill(t.ctx, facts[0]!.href)).value).toBe(600_000);
    expect((await openDrill(t.ctx, facts[1]!.href)).value).toBe(-44_400);
  });

  it("ends on the Period's Profit, Income and Expense as the Key figures and Profit and loss give them", async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');
    const keyFigures = await loadSection(t.ctx, ROLLING_30, 'keyFigures');
    const statement = await loadSection(t.ctx, ROLLING_30, 'profitAndLoss');
    const last = areasOf(readCard(card, money).mark).points.at(-1)!;

    const keyFigure = (id: string) => keyFigures.figures.find((figure) => figure.id === id)!.value;
    const row = (id: string) => statement.rows.find((item) => item.id === id)!.value;
    expect(last.income - last.expense).toBe(keyFigure('profit'));
    expect(last.income - last.expense).toBe(row('profit'));
    expect([last.income, last.expense]).toEqual([keyFigure('income'), keyFigure('expense')]);
    expect([last.income, last.expense]).toEqual([row('income'), row('expense')]);
  });

  it('opens each point onto the Transactions from the first day through it, back to Analytics', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');
    const { points } = areasOf(readCard(card, money).mark);

    for (const point of points.filter((_, index) => index % 4 === 0 || index >= 28)) {
      expect(originOf(point.href)).toEqual({
        kind: 'analytics',
        page: { period: ROLLING_30, cardPeriods: {} },
      });
      expect((await openDrill(t.ctx, point.href)).value ?? 0).toBe(point.income - point.expense);
      expect((await openDrill(t.ctx, point.incomeHref)).value ?? 0).toBe(point.income);
      expect(0 - ((await openDrill(t.ctx, point.expenseHref)).value ?? 0)).toBe(point.expense);
    }
  });

  it('is split into days whatever the Period, from its start date', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, YEARLY, 'incomeVsExpense');
    const { points } = areasOf(readCard(card, money).mark);

    // 2021 to 2024 (2024 a leap year), then 1 January to 20 March 2025.
    expect(points).toHaveLength(365 * 4 + 1 + 31 + 28 + 20);
    expect(points[0]!.key).toBe('2021-01-01');
    expect(points.at(-1)).toMatchObject({ key: '2025-03-20', income: 600_000 });
    // Groceries on 10 February count in this longer Period.
    expect(points.at(-1)!.expense).toBe(44_400 + 999);
  });

  it('never starts before the first Transaction', async () => {
    fixToday('2025-03-20');
    const group = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
    const salary = await createCategory(t.ctx, { groupId: group.id, name: 'Salary' });
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-15', amountMinor: 100_000, classify: { categoryId: salary.id } },
      { bookingDate: '2025-03-16', amountMinor: -1_000 },
    ]);

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');

    expect(card.data!.rows.map((row) => row.key)).toEqual([
      ...['2025-03-15', '2025-03-16', '2025-03-17', '2025-03-18', '2025-03-19', '2025-03-20'],
    ]);
  });

  it('pinned, is read wholly over its Card Period: its days, running totals and Drill-downs', async () => {
    fixToday('2025-03-20');
    await dataset();
    const pins = { 'income-vs-expense': 'rolling-60-days' } as const;

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense', pins);
    const { points } = areasOf(readCard(card, money).mark);

    expect(card.isPinned).toBe(true);
    expect(card.periodName).toBe('Last 60 days');
    expect(card.reading).toMatchObject({
      period: presetPeriod('rolling-60-days'),
      from: '2025-01-20',
    });
    expect(points).toHaveLength(60);
    expect(points[0]!.key).toBe('2025-01-20');
    // Groceries on 10 February fall inside the pin, outside the page's Last 30 days.
    expect(points.at(-1)).toMatchObject({ income: 600_000, expense: 44_400 + 999 });
    const lead = readCard(card, money).lead!;
    expect(lead.detail).toBe(String(600_000 - 44_400 - 999));
    for (const href of [lead.href, points[30]!.href, points.at(-1)!.href]) {
      expect(originOf(href!)).toEqual({
        kind: 'analytics',
        page: { period: ROLLING_30, cardPeriods: pins },
      });
    }
    expect((await openDrill(t.ctx, lead.href)).value).toBe(600_000 - 44_400 - 999);
    expect((await openDrill(t.ctx, points[30]!.href)).value).toBe(
      points[30]!.income - points[30]!.expense,
    );
  });

  it('unpinned, follows the page Period', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'incomeVsExpense', {
      'profit-per-interval': 'rolling-30-days',
    });

    expect(card.isPinned).toBe(false);
    expect(card.periodName).toBeNull();
    expect(card.data!.rows[0]!.key).toBe('2024-03-21');
  });

  it('is empty when the Period has no income or expense, Capital and Unclassified aside', async () => {
    fixToday('2025-03-20');
    const group = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
    const property = await createCategory(t.ctx, { groupId: group.id, name: 'Property' });
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedEarlyStart(t.ctx, ubs);
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-05', amountMinor: -500_000, classify: { categoryId: property.id } },
      { bookingDate: '2025-03-06', amountMinor: -7_000 },
    ]);

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');

    expect(card.isEmpty).toBe(true);
  });

  it('hints at two areas before its figures arrive', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, ROLLING_30, 'incomeVsExpense');

    expect(cardFrame({ ...card, data: null }).placeholder).toBe('areas');
  });
});

import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { toPivotData } from '@/app/widgets/pivot-data';
import { toDonutSlices, toSeriesChart, type ChartSource } from '@/lib/reporting/chart-data';
import { changeWorking } from '@/lib/reporting/drill-summary';
import { findMonthFlows, spendingInsight } from '@/lib/reporting/overview';
import { chapterStory, rankedTotals, type StoryWidget } from '@/lib/reporting/story';
import { cellFromParams, queryFromParams } from '@/lib/reporting/widget-params';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { editClassification } from '../transactions';
import {
  listCellTransactions,
  runWidgetQuery,
  type CellTransactionPage,
  type Visualisation,
  type WidgetQueryInput,
} from '.';

/**
 * The figures a chart or the Story works out itself ("Other", averages, what was kept, the
 * insight's change) against their Drill-downs (GLOSSARY: Drill-down): each figure must be
 * what its Drill-down works out from the Transactions it lists.
 */

const t = setupTestDatabase();

const Q1_2025 = { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' } as const;
const MONTHS = ['2025-01', '2025-02', '2025-03'];

/**
 * Q1 2025 on one CHF Account: a salary each month, and nine expense Categories (one more than
 * a chart's colours, so they fold into "Other") with odd amounts, so averages round.
 */
async function dataset(): Promise<void> {
  const bank = await createBank(t.ctx, { name: 'UBS' });
  const account = await createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
  const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const living = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
  const expenses: Category[] = [];
  for (let index = 1; index <= 9; index++) {
    expenses.push(await createCategory(t.ctx, { groupId: living.id, name: `Cost ${index}` }));
  }

  const rows = MONTHS.flatMap((month, m) => [
    {
      bookingDate: `${month}-25`,
      amountMinor: [500_000, 400_001, 600_000][m]!,
      categoryId: salary.id,
    },
    ...expenses.map((category, index) => ({
      bookingDate: `${month}-${String(10 + index).padStart(2, '0')}`,
      amountMinor: -((index + 1) * 10_000 + m * 777 + 1),
      categoryId: category.id,
    })),
  ]);
  const ids = await seedTransactions(t.ctx.db, account, rows);
  for (const [index, row] of rows.entries()) {
    await editClassification(t.ctx, ids[index]!, { categoryId: row.categoryId });
  }
}

/** A Widget's data, linked as on a Dashboard. */
async function widget(
  query: WidgetQueryInput,
  visualisation: Visualisation,
): Promise<StoryWidget & { data: ChartSource }> {
  const report = await runWidgetQuery(t.ctx, query);
  return { id: 'w', name: 'Widget', source: 'query', visualisation, data: toPivotData(report) };
}

/** Opens a Drill-down link as its page does: its query and its cell, read from the URL. */
async function open(href: string | null | undefined): Promise<CellTransactionPage> {
  expect(href).toBeTruthy();
  const url = new URL(href!, 'http://localhost');
  const params: Record<string, string | string[]> = {};
  for (const name of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(name);
    params[name] = values.length === 1 ? values[0]! : values;
  }
  const page = await listCellTransactions(t.ctx, queryFromParams(params), {
    ...cellFromParams(params),
    pageSize: 200,
  });
  // What the list shows adds up to the page's sum.
  expect(page.transactions).toHaveLength(page.total);
  expect(page.transactions.reduce((sum, item) => sum + item.chfMinor, 0)).toBe(page.sumChfMinor);
  return page;
}

/** Amounts as bare minor units, by magnitude: the Story says "went out" without a sign. */
const money = (minor: number) => String(Math.abs(minor));

const spendingQuery: WidgetQueryInput = {
  dateRange: Q1_2025,
  rows: 'month',
  columns: 'category',
  filters: { categoryGroupTypes: ['expense'] },
};
const flowQuery = { dateRange: Q1_2025, rows: 'month', columns: 'categoryGroupType' } as const;

describe('"Other" drills down to what it folds', () => {
  it('adds up, point by point and over the range, on a line or stacked bar', async () => {
    await dataset();
    const { data } = await widget(spendingQuery, 'stacked_bar');
    const chart = toSeriesChart(data);
    const other = chart.series.at(-1)!;
    expect(other.label).toBe('Other');

    for (const point of chart.points) {
      expect((await open(point.hrefs[other.key])).value).toBe(point.values[other.key]);
    }
    const ranked = rankedTotals(data, 9).find((item) => item.name === 'Other')!;
    expect((await open(ranked.href)).value).toBe(ranked.value);
  });

  it('adds up on a donut', async () => {
    await dataset();
    const { data } = await widget(
      { dateRange: Q1_2025, rows: 'category', filters: { categoryGroupTypes: ['expense'] } },
      'donut',
    );
    const other = toDonutSlices(data).at(-1)!;
    expect(other.label).toBe('Other');

    expect((await open(other.href)).value).toBe(other.signedValue);
  });
});

describe('each Story fact is what its Drill-down works out', () => {
  it('for spending: the leader, the heaviest and lightest months, and the monthly average', async () => {
    await dataset();
    const spending = await widget(spendingQuery, 'stacked_bar');
    const story = chapterStory(spending, money);

    expect(story.facts.map((fact) => fact.label)).toEqual([
      'Heaviest month: Mar 2025',
      'Lightest month: Jan 2025',
      'Monthly average',
    ]);
    expect(money((await open(story.lead!.href)).value!)).toBe(story.lead!.detail);
    for (const fact of story.facts) {
      expect(money((await open(fact.href)).value!)).toBe(fact.value);
    }
    const average = await open(story.facts[2]!.href);
    expect(average).toMatchObject({ measure: 'average', averagePer: 'month', periodCount: 3 });
  });

  it('for income vs. expense: most in, most out and kept per month', async () => {
    await dataset();
    const flow = await widget(flowQuery, 'stacked_bar');
    const story = chapterStory(flow, money);

    expect(story.lead!.headline).toBe('Most came in: Mar 2025');
    expect(money((await open(story.lead!.href)).value!)).toBe(story.lead!.detail);
    for (const fact of story.facts) {
      expect(money((await open(fact.href)).value!)).toBe(fact.value);
    }
    // Kept: income and expense together, signed so they net to it, over 3 months.
    const kept = await open(story.facts[1]!.href);
    expect(kept.periodCount).toBe(3);
    expect(kept.transactions.some((item) => item.chfMinor > 0)).toBe(true);
    expect(kept.transactions.some((item) => item.chfMinor < 0)).toBe(true);
  });
});

describe("the overview's figures are what their Drill-downs work out", () => {
  it('kept over the months is the grand total of income and expense', async () => {
    await dataset();
    const found = findMonthFlows([await widget(flowQuery, 'stacked_bar')])!;
    const kept = found.months.reduce((total, month) => total + month.net, 0);

    expect((await open(found.href)).value).toBe(kept);
  });

  it('the insight opens the latest month only, and its change from the months subtotalled', async () => {
    await dataset();
    const found = findMonthFlows([await widget(flowQuery, 'stacked_bar')])!;
    const latest = found.months.at(-1)!;

    const month = await open(found.latestHref);
    expect(month.span).toEqual({ from: '2025-03-01', to: '2025-03-31' });
    expect(month.value).toBe(latest.net);

    const change = await open(found.changeHref);
    expect(change.subtotals?.map((period) => period.key)).toEqual(MONTHS.toReversed());
    expect(change.subtotals?.map((period) => -period.sumChfMinor)).toEqual(
      found.months.map((period) => period.expense).toReversed(),
    );
    const percent = spendingInsight(found.months)!.detail[1].match(/^(\d+)%/)![1];
    const working = changeWorking(
      change.subtotals!.map((period) => ({ label: period.key, sumChfMinor: period.sumChfMinor })),
      String,
    );
    expect(working).toMatch(new RegExp(`→ [+−]${percent}%$`));
  });
});

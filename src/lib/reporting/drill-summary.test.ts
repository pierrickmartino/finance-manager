import { describe, expect, it } from 'vitest';
import type { WidgetQuery } from '@/server/services/reporting/query';
import { drillFilterLine, drillHeadline, type DrillNumber } from './drill-summary';
import type { FilterChoices } from './query-filters';
import { DEFAULT_WIDGET_QUERY } from './widget-params';

/** CHF in whole francs with a thousands comma, like the examples in the spec. */
const chf = (minor: number) => `CHF ${(minor / 100).toLocaleString('en-US')}`;

const number = (more: Partial<DrillNumber>): DrillNumber => ({
  measure: 'sum',
  averagePer: 'month',
  value: null,
  periodCount: 12,
  total: 0,
  sumChfMinor: null,
  ...more,
});

describe('drillHeadline', () => {
  it('states a sum as its Transactions and their total', () => {
    expect(drillHeadline(number({ total: 14, sumChfMinor: 124_000, value: 124_000 }), chf)).toBe(
      '14 Transactions, total CHF 1,240',
    );
  });

  it('states a count as its Transactions', () => {
    expect(
      drillHeadline(number({ measure: 'count', total: 14, sumChfMinor: 124_000, value: 14 }), chf),
    ).toBe('14 Transactions');
    expect(drillHeadline(number({ measure: 'count', total: 1, value: 1 }), chf)).toBe(
      '1 Transaction',
    );
  });

  it('works an average out: the sum over its periods', () => {
    const average = number({ measure: 'average', total: 20, sumChfMinor: 360_000, value: 30_000 });
    expect(drillHeadline(average, chf)).toBe('CHF 3,600 ÷ 12 months = CHF 300 / month');
    expect(
      drillHeadline({ ...average, averagePer: 'quarter', periodCount: 1, value: 360_000 }, chf),
    ).toBe('CHF 3,600 ÷ 1 quarter = CHF 3,600 / quarter');
  });

  it('says so when no Transaction falls in the cell', () => {
    expect(drillHeadline(number({}), chf)).toBe('No Transactions');
    expect(drillHeadline(number({ measure: 'average' }), chf)).toBe('No Transactions');
  });
});

const CHOICES: FilterChoices = {
  accounts: [
    { id: 'a1', bankName: 'UBS', name: 'Household', currency: 'CHF' },
    { id: 'a2', bankName: 'Revolut', name: 'Travel', currency: 'EUR' },
  ],
  groups: [{ id: 'g1', name: 'Food', categories: [{ id: 'c1', name: 'Groceries' }] }],
  payees: [{ id: 'p1', name: 'Migros' }],
  tags: [{ id: 't1', name: 'Holiday' }],
};

const query = (more: Partial<WidgetQuery>): WidgetQuery => ({ ...DEFAULT_WIDGET_QUERY, ...more });

describe('drillFilterLine', () => {
  it('with no filters: the period, Capital and Transfers left out', () => {
    expect(drillFilterLine(query({}), CHOICES, '1 Jan 2025 to 31 Mar 2025')).toEqual([
      '1 Jan 2025 to 31 Mar 2025',
      'Capital left out',
      'Transfers left out',
    ]);
  });

  it('lists every filter of the query, by name, and nothing else', () => {
    const filtered = query({
      filters: {
        accountIds: ['a1', 'a2'],
        categoryGroupIds: ['g1'],
        categoryIds: ['c1'],
        payeeIds: ['p1'],
        tagIds: ['t1'],
        categoryGroupTypes: ['expense'],
        currencies: ['EUR'],
      },
    });

    expect(drillFilterLine(filtered, CHOICES, 'Q1 2025')).toEqual([
      'Q1 2025',
      'Accounts: UBS · Household, Revolut · Travel',
      'Category groups: Food',
      'Categories: Food › Groceries',
      'Payees: Migros',
      'Tags: Holiday',
      'Category group types: Expense',
      'Currencies: EUR',
      'Capital left out',
      'Transfers left out',
    ]);
  });

  it('keeps Capital in when the query asks for it, directly or by its type', () => {
    const withCapital = drillFilterLine(query({ includeCapital: true }), CHOICES, 'Q1 2025');
    const byType = drillFilterLine(
      query({ filters: { categoryGroupTypes: ['capital'] } }),
      CHOICES,
      'Q1 2025',
    );

    expect(withCapital).toEqual(['Q1 2025', 'Transfers left out']);
    expect(byType).toEqual(['Q1 2025', 'Category group types: Capital', 'Transfers left out']);
  });

  it('names a filter value it no longer knows as unknown', () => {
    expect(drillFilterLine(query({ filters: { payeeIds: ['gone'] } }), CHOICES, 'Q1 2025')[1]).toBe(
      'Payees: Unknown',
    );
  });
});

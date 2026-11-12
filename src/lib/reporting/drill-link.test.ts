import { describe, expect, it } from 'vitest';
import type { WidgetQuery } from '@/server/services/reporting/query';
import { unconvertedUrl } from './drill-link';
import { DEFAULT_WIDGET_QUERY } from './widget-params';

const SPAN = { from: '2025-01-01', to: '2025-03-31' };
const query = (more: Partial<WidgetQuery>): WidgetQuery => ({ ...DEFAULT_WIDGET_QUERY, ...more });
const paramsOf = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

describe('unconvertedUrl', () => {
  it("lists the Transactions with no FX rate in the cell's dates", () => {
    const url = unconvertedUrl(query({}), {}, SPAN);

    expect(url.startsWith('/transactions?')).toBe(true);
    expect(paramsOf(url)).toEqual({ fxRate: 'missing', from: '2025-01-01', to: '2025-03-31' });
  });

  it('narrows by each filter the Widget sets to exactly one value', () => {
    const filtered = query({
      filters: {
        accountIds: ['a1'],
        categoryIds: ['c1'],
        payeeIds: ['p1'],
        tagIds: ['t1'],
        categoryGroupTypes: ['expense'],
      },
    });

    expect(paramsOf(unconvertedUrl(filtered, {}, SPAN))).toMatchObject({
      accountId: 'a1',
      categoryId: 'c1',
      payeeId: 'p1',
      tagId: 't1',
      groupType: 'expense',
    });
  });

  it('leaves out a filter on several values, which the list cannot express', () => {
    const params = paramsOf(
      unconvertedUrl(query({ filters: { categoryIds: ['c1', 'c2'], payeeIds: [] } }), {}, SPAN),
    );

    expect(params).not.toHaveProperty('categoryId');
    expect(params).not.toHaveProperty('payeeId');
  });

  it('narrows by the single Category, Payee or Tag clicked, over the filter', () => {
    const byCategory = query({
      rows: 'category',
      columns: 'payee',
      filters: { categoryIds: ['c1'] },
    });

    expect(paramsOf(unconvertedUrl(byCategory, { row: 'c2', column: 'p1' }, SPAN))).toMatchObject({
      categoryId: 'c2',
      payeeId: 'p1',
    });
    expect(
      paramsOf(unconvertedUrl(query({ rows: 'tag', columns: null }), { row: 't9' }, SPAN)),
    ).toMatchObject({ tagId: 't9' });
  });

  it('does not narrow by a "none" bucket, an "Other" or a period', () => {
    const params = paramsOf(
      unconvertedUrl(
        query({ rows: 'month', columns: 'category' }),
        { row: '2025-02', column: { except: ['c1'] } },
        SPAN,
      ),
    );
    const none = paramsOf(unconvertedUrl(query({ rows: 'payee' }), { row: null }, SPAN));

    expect(params).toEqual({ fxRate: 'missing', from: '2025-01-01', to: '2025-03-31' });
    expect(none).not.toHaveProperty('payeeId');
  });
});

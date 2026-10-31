import type { CellRef } from '@/server/services/reporting/drill';
import type {
  ReportFilters,
  WidgetQuery,
  WidgetQueryInput,
} from '@/server/services/reporting/query';

/**
 * A Widget query as URL parameters, so the Widget editor is a plain GET form and every report
 * cell can link to its drill-down. Values are passed through as typed; the reporting service
 * validates them.
 *
 * `range=fixed&from&to` | `range=last&count&unit[&current=1]` | `range=yearToDate[&current=1]`,
 * `rows`, `columns` (empty = none), `measure`, `per`, `capital=1`, and repeated filter
 * parameters `account`, `group`, `category`, `payee`, `tag`, `type`, `currency`.
 */

export type UrlParams = Record<string, string | string[] | undefined>;

/** What the Widget editor starts from: spending by Category, month by month, last 12 months. */
export const DEFAULT_WIDGET_QUERY: WidgetQuery = {
  filters: {},
  dateRange: { kind: 'last', count: 12, unit: 'month', includeCurrent: false },
  rows: 'month',
  columns: 'category',
  measure: 'sum',
  averagePer: 'month',
  includeCapital: false,
};

const FILTER_PARAMS = [
  ['account', 'accountIds'],
  ['group', 'categoryGroupIds'],
  ['category', 'categoryIds'],
  ['payee', 'payeeIds'],
  ['tag', 'tagIds'],
  ['type', 'categoryGroupTypes'],
  ['currency', 'currencies'],
] as const satisfies ReadonlyArray<readonly [string, keyof ReportFilters]>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function all(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((item) => item.trim()).filter(Boolean);
}

function readRange(params: UrlParams): WidgetQueryInput['dateRange'] {
  const includeCurrent = first(params.current) === '1';
  switch (first(params.range)) {
    case 'fixed':
      return { kind: 'fixed', from: first(params.from), to: first(params.to) };
    case 'yearToDate':
      return { kind: 'yearToDate', includeCurrent };
    default:
      return {
        kind: 'last',
        count: Number(first(params.count)),
        unit: first(params.unit) as 'month',
        includeCurrent,
      };
  }
}

/** Reads a Widget query from URL parameters; with no `range`, the default query. */
export function queryFromParams(params: UrlParams): WidgetQueryInput {
  if (!first(params.range)) return DEFAULT_WIDGET_QUERY;
  const filters: Record<string, string[]> = {};
  for (const [param, field] of FILTER_PARAMS) {
    const values = all(params[param]);
    if (values.length) filters[field] = values;
  }
  return {
    filters: filters as ReportFilters,
    dateRange: readRange(params),
    rows: (first(params.rows) || null) as WidgetQuery['rows'],
    columns: (first(params.columns) || null) as WidgetQuery['columns'],
    measure: (first(params.measure) || 'sum') as WidgetQuery['measure'],
    averagePer: (first(params.per) || 'month') as WidgetQuery['averagePer'],
    includeCapital: first(params.capital) === '1',
  };
}

/** Writes a Widget query as URL parameters (the inverse of `queryFromParams`). */
export function queryToParams(query: WidgetQueryInput): URLSearchParams {
  const params = new URLSearchParams();
  const range = query.dateRange;
  params.set('range', range.kind);
  if (range.kind === 'fixed') {
    params.set('from', range.from);
    params.set('to', range.to);
  } else {
    if (range.kind === 'last') {
      params.set('count', String(range.count));
      params.set('unit', range.unit);
    }
    if (range.includeCurrent) params.set('current', '1');
  }
  params.set('rows', query.rows ?? '');
  params.set('columns', query.columns ?? '');
  params.set('measure', query.measure ?? 'sum');
  params.set('per', query.averagePer ?? 'month');
  if (query.includeCapital) params.set('capital', '1');
  for (const [param, field] of FILTER_PARAMS) {
    for (const value of query.filters?.[field] ?? []) params.append(param, value);
  }
  return params;
}

/** URL value of the "none" bucket (no Category, no Payee, no Tag). */
const NONE = 'none';

/** Drill-down cell parameters: `row`, `column` (absent = the whole axis), `page`. */
export function cellToParams(cell: CellRef): URLSearchParams {
  const params = new URLSearchParams();
  if (cell.row !== undefined) params.set('row', cell.row ?? NONE);
  if (cell.column !== undefined) params.set('column', cell.column ?? NONE);
  if (cell.page !== undefined && cell.page > 1) params.set('page', String(cell.page));
  return params;
}

export function cellFromParams(params: UrlParams): CellRef {
  const key = (name: string): string | null | undefined => {
    if (params[name] === undefined) return undefined;
    const value = first(params[name]);
    return value === NONE ? null : value;
  };
  const cell: CellRef = {};
  const row = key('row');
  const column = key('column');
  if (row !== undefined) cell.row = row;
  if (column !== undefined) cell.column = column;
  const page = Number(first(params.page));
  cell.page = Number.isSafeInteger(page) && page >= 1 ? page : 1;
  return cell;
}

import type { AxisSelector, CellRef } from '@/server/services/reporting/cell-ref';
import type { DateSpan } from '@/server/services/reporting/periods';
import type {
  ReportAxis,
  ReportFilters,
  TimeAxis,
  WidgetQuery,
} from '@/server/services/reporting/query';
import { originToParams, type DrillOrigin } from './drill-origin';
import { cellToParams, queryToParams } from './widget-params';

/**
 * Where a report's Drill-downs lead (GLOSSARY: Drill-down): its query, and where they were
 * opened from, to link back there. Plain data, so a chart can build the link of a value it
 * works out itself (an "Other", an average).
 */
export interface DrillTarget {
  query: WidgetQuery;
  origin: DrillOrigin;
}

/** The Drill-down of one cell of the target's query. */
export function drillUrl(target: DrillTarget, cell: CellRef): string {
  const params = queryToParams(target.query);
  // Appended: "every key but these" repeats its parameter, once per key.
  for (const [name, value] of cellToParams(cell)) params.append(name, value);
  for (const [name, value] of originToParams(target.origin)) params.set(name, value);
  return `/widgets/drill?${params}`;
}

/** The same Drill-downs, as an average per `period` of each cell's sum. */
export function averaged(target: DrillTarget, period: TimeAxis): DrillTarget {
  return { ...target, query: { ...target.query, measure: 'average', averagePer: period } };
}

/**
 * The Transactions List's filters a report's can narrow to: the list takes one value each, so a
 * Widget filter narrows it only when it selects exactly one, and so does a cell on that axis.
 */
const LIST_FILTERS = [
  ['accountId', 'accountIds', 'account'],
  ['categoryId', 'categoryIds', 'category'],
  ['payeeId', 'payeeIds', 'payee'],
  ['tagId', 'tagIds', 'tag'],
  ['groupType', 'categoryGroupTypes', 'categoryGroupType'],
] as const satisfies ReadonlyArray<readonly [string, keyof ReportFilters, ReportAxis]>;

/** The one key a cell selects on `axis`, if any (not "none", nor "every key but some"). */
function cellKeyOn(query: WidgetQuery, cell: CellRef, axis: ReportAxis): string | undefined {
  const selectors: [ReportAxis | null, AxisSelector | undefined][] = [
    [query.rows, cell.row],
    [query.columns, cell.column],
  ];
  const found = selectors.find(([on, selector]) => on === axis && typeof selector === 'string');
  return found?.[1] as string | undefined;
}

/**
 * The Transactions List filtered to the ones a cell leaves out for want of an FX rate, as close
 * as the list can express: the cell's dates, and each Account, Category, Payee, Tag or Category
 * Group type the cell or the Widget's filters narrow to a single one of.
 */
export function unconvertedUrl(query: WidgetQuery, cell: CellRef, span: DateSpan | null): string {
  const dates: [string, string][] = span
    ? [
        ['from', span.from],
        ['to', span.to],
      ]
    : [];
  const narrowed = LIST_FILTERS.flatMap(([param, filter, axis]): [string, string][] => {
    const values = query.filters[filter] ?? [];
    const value = cellKeyOn(query, cell, axis) ?? (values.length === 1 ? values[0] : undefined);
    return value === undefined ? [] : [[param, value]];
  });
  return `/transactions?${new URLSearchParams([['fxRate', 'missing'], ...dates, ...narrowed])}`;
}

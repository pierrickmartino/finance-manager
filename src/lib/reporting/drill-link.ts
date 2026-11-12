import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { TimeAxis, WidgetQuery } from '@/server/services/reporting/query';
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

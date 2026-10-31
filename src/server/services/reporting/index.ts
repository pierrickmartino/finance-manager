/**
 * Reporting (spec 99–107): the one query engine every Widget uses. A Widget query definition
 * (`WidgetQueryInput`) runs into a rows × columns table of CHF values (`runWidgetQuery`), and
 * any cell drills down to its Transactions (`listCellTransactions`).
 */
export { runWidgetQuery, type ReportTable } from './engine';
export type { ReportHeader } from './headers';
export {
  AXIS_LABELS,
  isTimeAxis,
  MEASURE_LABELS,
  MEASURES,
  REPORT_AXES,
  TIME_AXES,
  type DateRange,
  type Measure,
  type ReportAxis,
  type ReportFilters,
  type TimeAxis,
  type WidgetQuery,
  type WidgetQueryInput,
} from './query';

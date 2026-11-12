/**
 * Which cell of a report a Drill-down lists (spec 107). Pure, so the pages and charts that
 * build Drill-down links can use it.
 */

/** Every key of an axis but these (`null` names the "none" bucket): what "Other" folds. */
export interface AxisExcept {
  except: (string | null)[];
}

/** One key of an axis (`null`: the "none" bucket), or every key of it but some. */
export type AxisSelector = string | null | AxisExcept;

export function isExcept(selector: AxisSelector | undefined): selector is AxisExcept {
  return typeof selector === 'object' && selector !== null;
}

/**
 * A cell by the header keys of the report. An absent key means the whole axis: `{ row }` is a
 * row total, `{}` the grand total. `null` is the "none" bucket (no Category, no Payee, no Tag),
 * as in `ReportHeader.key`. `{ except }` is every key of the axis but those named. `change`
 * asks for the cell's sum per period of the rows (a time axis): the subtotals a change between
 * periods is worked out from.
 */
export interface CellRef {
  row?: AxisSelector;
  column?: AxisSelector;
  change?: boolean;
  page?: number;
  pageSize?: number;
}

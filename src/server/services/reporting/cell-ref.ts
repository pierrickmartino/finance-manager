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
 * as in `ReportHeader.key`. `{ except }` is every key of the axis but those named.
 */
export interface CellRef {
  row?: AxisSelector;
  column?: AxisSelector;
  /**
   * Also sum the cell per period of the rows (a time axis): the subtotals a change between
   * periods is worked out from.
   */
  withPeriodSubtotals?: boolean;
  page?: number;
  pageSize?: number;
}

/** The items a selector keeps (all when absent), in their order, by each item's key. */
export function keptBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string | null,
  selector: AxisSelector | undefined,
): T[] {
  if (selector === undefined) return [...items];
  if (isExcept(selector)) return items.filter((item) => !selector.except.includes(keyOf(item)));
  return items.filter((item) => keyOf(item) === selector);
}

/** The first and the last of some items (the same one when there is one); null for none. */
export function ends<T>(items: readonly T[]): [first: T, last: T] | null {
  return items.length === 0 ? null : [items[0]!, items.at(-1)!];
}

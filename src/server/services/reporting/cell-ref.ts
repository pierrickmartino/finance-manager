/**
 * Which cell of a report a Drill-down lists (spec 107). Pure, so the pages and charts that
 * build Drill-down links can use it.
 */

/** Every key of an axis but these (`null` names the "none" bucket): what "Other" folds. */
export interface AxisExcept {
  except: (string | null)[];
}

/**
 * Every key of a time axis up to and including this one: the days from the first through one
 * day, as a running total adds them up. Time keys (`2025`, `2025-Q1`, `2025-03`, `2025-03-14`)
 * sort as text, so "up to" compares them so.
 */
export interface AxisThrough {
  through: string;
}

/**
 * One key of an axis (`null`: the "none" bucket), every key of it but some, or (a time axis)
 * every key up to one.
 */
export type AxisSelector = string | null | AxisExcept | AxisThrough;

export function isExcept(selector: AxisSelector | undefined): selector is AxisExcept {
  return typeof selector === 'object' && selector !== null && 'except' in selector;
}

export function isThrough(selector: AxisSelector | undefined): selector is AxisThrough {
  return typeof selector === 'object' && selector !== null && 'through' in selector;
}

/**
 * A cell by the header keys of the report. An absent key means the whole axis: `{ row }` is a
 * row total, `{}` the grand total. `null` is the "none" bucket (no Category, no Payee, no Tag),
 * as in `ReportHeader.key`. `{ except }` is every key of the axis but those named; `{ through }`
 * every key of a time axis up to and including the one named.
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
  if (isThrough(selector)) {
    return items.filter((item) => {
      const key = keyOf(item);
      return key !== null && key <= selector.through;
    });
  }
  return items.filter((item) => keyOf(item) === selector);
}

/** The first and the last of some items (the same one when there is one); null for none. */
export function ends<T>(items: readonly T[]): [first: T, last: T] | null {
  return items.length === 0 ? null : [items[0]!, items.at(-1)!];
}

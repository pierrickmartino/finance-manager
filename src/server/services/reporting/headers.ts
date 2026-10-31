import { formatPeriod } from '@/lib/format';
import type { Queryable } from '@/server/db/client';
import { CATEGORY_GROUP_TYPE_LABELS, CATEGORY_GROUP_TYPES } from '../categories/model';
import { intersect, periodSpan, periodsIn, type DateSpan } from './periods';
import { isTimeAxis, type ReportAxis } from './query';

/** One row or column of a report. */
export interface ReportHeader {
  /**
   * The axis value: a period key (`2025-03`, `2025-Q1`, `2025`), an id, a Category group type
   * or a Currency code. `null` is the "none" bucket (no Category, no Payee, no Tag), or the
   * single header of a report without this axis.
   */
  key: string | null;
  label: string;
  /** A time period that is the current, incomplete one (spec 101). */
  isPartial: boolean;
}

/** The single header used when a report has no axis on that side. */
export const ALL_HEADER: ReportHeader = { key: null, label: 'Total', isPartial: false };

const NONE_LABELS: Partial<Record<ReportAxis, string>> = {
  categoryGroupType: 'Unclassified',
  categoryGroup: 'Unclassified',
  category: 'Unclassified',
  payee: 'No Payee',
  tag: 'No Tag',
};

interface Labelled {
  key: string;
  label: string;
}

/** Labels for the non-null keys, in display order. */
async function labelKeys(db: Queryable, axis: ReportAxis, keys: string[]): Promise<Labelled[]> {
  const query = async (sql: string): Promise<Labelled[]> =>
    (await db.query<Labelled>(sql, [keys])).rows;
  switch (axis) {
    case 'categoryGroupType':
      return CATEGORY_GROUP_TYPES.filter((type) => keys.includes(type)).map((type) => ({
        key: type,
        label: CATEGORY_GROUP_TYPE_LABELS[type],
      }));
    case 'categoryGroup':
      return query(`SELECT id::text AS key, name AS label FROM category_group
                    WHERE id = ANY($1::uuid[]) ORDER BY sort, name`);
    case 'category':
      return query(`SELECT c.id::text AS key, g.name || ' › ' || c.name AS label
                    FROM category c JOIN category_group g ON g.id = c.group_id
                    WHERE c.id = ANY($1::uuid[]) ORDER BY g.sort, g.name, c.sort, c.name`);
    case 'account':
      return query(`SELECT a.id::text AS key, b.name || ' · ' || a.name AS label
                    FROM account a JOIN bank b ON b.id = a.bank_id
                    WHERE a.id = ANY($1::uuid[]) ORDER BY b.name, a.name`);
    case 'payee':
      return query(`SELECT id::text AS key, name AS label FROM payee
                    WHERE id = ANY($1::uuid[]) ORDER BY lower(name)`);
    case 'tag':
      return query(`SELECT id::text AS key, name AS label FROM tag
                    WHERE id = ANY($1::uuid[]) ORDER BY lower(name)`);
    default:
      return [...keys].sort().map((key) => ({ key, label: key }));
  }
}

/**
 * The headers of one axis: every period of the range for a time axis (so gaps show as empty
 * periods), otherwise the keys that have data, labelled and ordered, with the "none" bucket last.
 */
export async function axisHeaders(
  db: Queryable,
  axis: ReportAxis | null,
  keys: ReadonlySet<string | null>,
  range: DateSpan,
  partialPeriod: DateSpan | null,
): Promise<ReportHeader[]> {
  if (axis === null) return [ALL_HEADER];
  if (isTimeAxis(axis)) {
    return periodsIn(range, axis).map((key) => ({
      key,
      label: formatPeriod(key),
      isPartial: partialPeriod !== null && intersect(periodSpan(key, axis), partialPeriod) !== null,
    }));
  }
  const present = [...keys].filter((key): key is string => key !== null);
  const labelled = await labelKeys(db, axis, present);
  const headers: ReportHeader[] = labelled.map(({ key, label }) => ({
    key,
    label,
    isPartial: false,
  }));
  if (keys.has(null)) {
    headers.push({ key: null, label: NONE_LABELS[axis] ?? 'None', isPartial: false });
  }
  return headers;
}

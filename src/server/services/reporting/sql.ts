import { fractionDigits } from '@/lib/format';
import { BASE_CURRENCY } from '../fx/constants';
import type { DateSpan } from './periods';
import type { ReportAxis, WidgetQuery } from './query';

/**
 * SQL building blocks of the reporting engine. Every report and drill-down reads the same
 * `report_base` CTE: one reportable row per unsplit Transaction, and one per Split line of a
 * split Transaction (ADR-0004), in the range and passing the filters, with its amount
 * converted to CHF at the Transaction's booking date (ADR-0002). A Split line takes its amount,
 * Category and Tags from the line and everything else from its Transaction. Converting per row
 * and then summing is what makes each cell equal the sum of the rows it lists.
 */

/** Collects positional parameters while a statement is being written. */
export class SqlParams {
  readonly values: unknown[] = [];

  /** Adds a value and returns its placeholder (`$n`). */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** A reportable row's Category group type, `NULL` when it has no Category. */
const GROUP_TYPE = 'g.type';
/** A reportable row's Category: the Split line's, else the Transaction's. */
const CATEGORY_ID = 'coalesce(sl.category_id, t.category_id)';

/**
 * The Tags of a reportable row, as a subquery of distinct `tag_id`s: its Transaction's Tags
 * plus, for a Split line, the line's own (a Tag on both counts once).
 */
function rowTags(transactionId: string, lineId: string): string {
  return `(SELECT tag_id FROM transaction_tag WHERE transaction_id = ${transactionId}
           UNION SELECT tag_id FROM split_line_tag WHERE split_line_id = ${lineId})`;
}

function filterConditions(query: WidgetQuery, params: SqlParams): string[] {
  const { filters } = query;
  const conditions: string[] = [];
  const anyOf = (values: readonly string[] | undefined, sql: (param: string) => string) => {
    if (values && values.length > 0) conditions.push(sql(params.add(values)));
  };
  anyOf(filters.accountIds, (p) => `t.account_id = ANY(${p}::uuid[])`);
  anyOf(filters.categoryGroupIds, (p) => `c.group_id = ANY(${p}::uuid[])`);
  anyOf(filters.categoryIds, (p) => `${CATEGORY_ID} = ANY(${p}::uuid[])`);
  anyOf(filters.payeeIds, (p) => `t.payee_id = ANY(${p}::uuid[])`);
  anyOf(
    filters.tagIds,
    (p) => `EXISTS (SELECT 1 FROM ${rowTags('t.id', 'sl.id')} ft
                    WHERE ft.tag_id = ANY(${p}::uuid[]))`,
  );
  anyOf(filters.categoryGroupTypes, (p) => `${GROUP_TYPE} = ANY(${p}::text[])`);
  anyOf(filters.currencies, (p) => `t.currency = ANY(${p}::bpchar[])`);
  if (!includesCapital(query)) conditions.push(`${GROUP_TYPE} IS DISTINCT FROM 'capital'`);
  return conditions;
}

/** Capital is excluded unless the query asks for it, directly or through its type filter. */
export function includesCapital(query: WidgetQuery): boolean {
  return query.includeCapital || (query.filters.categoryGroupTypes ?? []).includes('capital');
}

/**
 * Multiplier from (amount in minor units × CHF per unit) to CHF minor units, for Currencies
 * whose minor unit isn't 1/100. Absent Currencies use 1.
 */
function minorUnitFactors(currencies: readonly string[]): Record<string, string> {
  const base = fractionDigits(BASE_CURRENCY);
  const factors: Record<string, string> = {};
  for (const currency of currencies) {
    const digits = fractionDigits(currency);
    if (digits !== base) factors[currency] = String(10 ** (base - digits));
  }
  return factors;
}

/**
 * `WITH report_base AS (...)`: reportable rows (unsplit Transactions and Split lines) in
 * `range` that pass the filters, never Transfers (spec 89). `id` is always the Transaction's,
 * `line_id` the Split line's (NULL for an unsplit Transaction). `chf_minor` is NULL when the
 * Currency has no rate on or before the booking date. `currencies` lists the Currencies in use, for their minor-unit factors.
 */
export function baseCte(
  query: WidgetQuery,
  range: DateSpan,
  currencies: readonly string[],
  params: SqlParams,
): string {
  const factors = params.add(JSON.stringify(minorUnitFactors(currencies)));
  const conditions = [
    't.transfer_id IS NULL',
    `t.booking_date BETWEEN ${params.add(range.from)}::date AND ${params.add(range.to)}::date`,
    ...filterConditions(query, params),
  ];
  return `WITH report_base AS MATERIALIZED (
    SELECT t.id, t.booking_date, t.currency::text AS currency, t.account_id, t.payee_id,
      sl.id AS line_id, ${CATEGORY_ID} AS category_id, c.group_id, ${GROUP_TYPE} AS group_type,
      round(coalesce(sl.amount_minor, t.amount_minor)
            * CASE WHEN t.currency = '${BASE_CURRENCY}' THEN 1 ELSE fx.rate_to_chf END
            * coalesce((${factors}::jsonb ->> t.currency::text)::numeric, 1))::bigint AS chf_minor
    FROM "transaction" t
    LEFT JOIN split_line sl ON sl.transaction_id = t.id
    LEFT JOIN category c ON c.id = ${CATEGORY_ID}
    LEFT JOIN category_group g ON g.id = c.group_id
    LEFT JOIN LATERAL (
      SELECT r.rate_to_chf FROM fx_rate r
      WHERE r.currency = t.currency AND r.date <= t.booking_date
      ORDER BY r.date DESC LIMIT 1
    ) fx ON t.currency <> '${BASE_CURRENCY}'
    WHERE ${conditions.join(' AND ')}
  )`;
}

/** The key expression of an axis over `report_base b` (and `bt`, its Tags, for the Tag axis). */
export function axisKey(axis: ReportAxis): string {
  switch (axis) {
    case 'month':
      return `to_char(b.booking_date, 'YYYY-MM')`;
    case 'quarter':
      return `to_char(b.booking_date, 'YYYY-"Q"Q')`;
    case 'year':
      return `to_char(b.booking_date, 'YYYY')`;
    case 'categoryGroupType':
      return 'b.group_type';
    case 'categoryGroup':
      return 'b.group_id::text';
    case 'category':
      return 'b.category_id::text';
    case 'account':
      return 'b.account_id::text';
    case 'payee':
      return 'b.payee_id::text';
    case 'tag':
      return 'bt.tag_id::text';
    case 'currency':
      return 'b.currency';
  }
}

/** Join needed by the Tag axis: a reportable row with two Tags counts under each. */
export const TAG_JOIN = `LEFT JOIN LATERAL ${rowTags('b.id', 'b.line_id')} bt ON true`;

/** Condition (over `report_base b`) selecting the reportable rows under one axis key. */
export function axisCondition(axis: ReportAxis, key: string | null, params: SqlParams): string {
  if (axis === 'tag') {
    const tags = rowTags('b.id', 'b.line_id');
    return key === null
      ? `NOT EXISTS (SELECT 1 FROM ${tags} dt)`
      : `EXISTS (SELECT 1 FROM ${tags} dt WHERE dt.tag_id = ${params.add(key)}::uuid)`;
  }
  return key === null ? `${axisKey(axis)} IS NULL` : `${axisKey(axis)} = ${params.add(key)}::text`;
}

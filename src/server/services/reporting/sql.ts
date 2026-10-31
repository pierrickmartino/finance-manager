import { fractionDigits } from '@/lib/format';
import { BASE_CURRENCY } from '../fx/constants';
import type { DateSpan } from './periods';
import type { ReportAxis, WidgetQuery } from './query';

/**
 * SQL building blocks of the reporting engine. Every report and drill-down reads the same
 * `report_base` CTE: one row per Transaction in the range that passes the filters, with its
 * amount converted to CHF at its booking date (ADR-0002). Converting per Transaction and then
 * summing is what makes each cell equal the sum of the Transactions it lists.
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

/** A Transaction's Category group type, `NULL` when it has no Category. */
const GROUP_TYPE = 'g.type';

function filterConditions(query: WidgetQuery, params: SqlParams): string[] {
  const { filters } = query;
  const conditions: string[] = [];
  const anyOf = (values: readonly string[] | undefined, sql: (param: string) => string) => {
    if (values && values.length > 0) conditions.push(sql(params.add(values)));
  };
  anyOf(filters.accountIds, (p) => `t.account_id = ANY(${p}::uuid[])`);
  anyOf(filters.categoryGroupIds, (p) => `c.group_id = ANY(${p}::uuid[])`);
  anyOf(filters.categoryIds, (p) => `t.category_id = ANY(${p}::uuid[])`);
  anyOf(filters.payeeIds, (p) => `t.payee_id = ANY(${p}::uuid[])`);
  anyOf(
    filters.tagIds,
    (p) => `EXISTS (SELECT 1 FROM transaction_tag ft
                    WHERE ft.transaction_id = t.id AND ft.tag_id = ANY(${p}::uuid[]))`,
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
 * `WITH report_base AS (...)`: Transactions in `range` that pass the filters, never Transfers
 * (spec 89). `chf_minor` is NULL when the Currency has no rate on or before the booking date.
 * `currencies` lists the Currencies in use, for their minor-unit factors.
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
      t.category_id, c.group_id, ${GROUP_TYPE} AS group_type,
      round(t.amount_minor
            * CASE WHEN t.currency = '${BASE_CURRENCY}' THEN 1 ELSE fx.rate_to_chf END
            * coalesce((${factors}::jsonb ->> t.currency::text)::numeric, 1))::bigint AS chf_minor
    FROM "transaction" t
    LEFT JOIN category c ON c.id = t.category_id
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

/** Join needed by the Tag axis: a Transaction with two Tags counts under each. */
export const TAG_JOIN = 'LEFT JOIN transaction_tag bt ON bt.transaction_id = b.id';

/** Condition (over `report_base b`) selecting the Transactions under one axis key. */
export function axisCondition(axis: ReportAxis, key: string | null, params: SqlParams): string {
  if (axis === 'tag') {
    return key === null
      ? 'NOT EXISTS (SELECT 1 FROM transaction_tag dt WHERE dt.transaction_id = b.id)'
      : `EXISTS (SELECT 1 FROM transaction_tag dt
                 WHERE dt.transaction_id = b.id AND dt.tag_id = ${params.add(key)}::uuid)`;
  }
  return key === null
    ? `${axisKey(axis)} IS NULL`
    : `${axisKey(axis)} = ${params.add(key)}::text`;
}

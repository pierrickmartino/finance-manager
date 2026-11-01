import { z } from 'zod';
import { CATEGORY_GROUP_TYPES } from '../categories/model';
import { IS_SPLIT, splitLineExists } from './split-guard';

/**
 * The Transaction list's filters (spec story 67). Every filter is optional and blank strings
 * mean "no filter", as an empty GET form submits them. Filters combine with AND.
 *
 * To add a filter: add its field to
 * `transactionFilterFields` and one `where(...)` line to `buildConditions`.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const TRANSACTION_STATUSES = ['imported', 'manual'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

const MAX_TEXT_LENGTH = 200;
const MAX_DESCRIPTION_KEY_LENGTH = 2000;

/**
 * SQL condition (alias `t`) for an Unclassified Transaction: no Category, not a Transfer and
 * not split (a split Transaction is classified by its Split lines, ADR-0004).
 * The filter, the Unclassified groups and the progress figure all use it.
 */
export const UNCLASSIFIED_CONDITION = `t.category_id IS NULL AND t.transfer_id IS NULL
  AND NOT ${IS_SPLIT}`;

/** `only`: Transactions in a Transfer. `exclude`: Transactions not in a Transfer. */
export const TRANSFER_FILTERS = ['only', 'exclude'] as const;
export type TransferFilter = (typeof TRANSFER_FILTERS)[number];

/** A filter field that is absent when blank (empty or only spaces). */
function optional<S extends z.ZodType>(schema: S) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
}

/** Escapes LIKE wildcards so the term matches literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

const transactionFilterFields = {
  /** Booking date range, both ends inclusive. */
  from: optional(z.iso.date({ error: 'From must be a date (YYYY-MM-DD)' })),
  to: optional(z.iso.date({ error: 'To must be a date (YYYY-MM-DD)' })),
  accountId: optional(z.uuid({ error: 'Unknown Account' })),
  /** Imported from a bank file, or entered by hand. */
  status: optional(z.enum(TRANSACTION_STATUSES, { error: 'Status must be imported or manual' })),
  /** Signed amount range in minor units, both ends inclusive (expenses are negative). */
  amountMin: optional(z.number().int({ error: 'Minimum amount must be an amount' })),
  amountMax: optional(z.number().int({ error: 'Maximum amount must be an amount' })),
  /**
   * Substring of the raw description, counterparty name or payment reference, ignoring case,
   * accents and repeated spaces.
   */
  text: optional(
    z
      .string()
      .trim()
      .max(MAX_TEXT_LENGTH, `Search text must be at most ${MAX_TEXT_LENGTH} characters`),
  ),
  payeeId: optional(z.uuid({ error: 'Unknown Payee' })),
  categoryId: optional(z.uuid({ error: 'Unknown Category' })),
  tagId: optional(z.uuid({ error: 'Unknown Tag' })),
  /** The type of the Category's group (or a Split line's): income, expense or capital. */
  groupType: optional(
    z.enum(CATEGORY_GROUP_TYPES, {
      error: 'Category group type must be Income, Expense or Capital',
    }),
  ),
  /** Only Transactions with no Category that are not in a Transfer. */
  unclassified: optional(z.boolean()),
  /** Only Transfers, or no Transfers. */
  transfer: optional(
    z.enum(TRANSFER_FILTERS, { error: 'Transfer filter must be only or exclude' }),
  ),
  /**
   * Normalised raw description, as the Unclassified groups key them. Not blank-stripped: the
   * empty key is the group of Transactions with no description.
   */
  descriptionKey: z.string().max(MAX_DESCRIPTION_KEY_LENGTH).optional(),
};

export const transactionQueryInput = z
  .object({
    ...transactionFilterFields,
    page: z.number().int().min(1, 'Page must be 1 or more').default(1),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE, `At most ${MAX_PAGE_SIZE} Transactions per page`)
      .default(DEFAULT_PAGE_SIZE),
  })
  .superRefine((input, issues) => {
    if (input.from && input.to && input.from > input.to) {
      issues.addIssue({ code: 'custom', message: 'From must not be after To' });
    }
    if (
      input.amountMin !== undefined &&
      input.amountMax !== undefined &&
      input.amountMin > input.amountMax
    ) {
      issues.addIssue({
        code: 'custom',
        message: 'Minimum amount must not be above maximum amount',
      });
    }
  });

/** Filters plus the page to return. */
export type TransactionQuery = z.input<typeof transactionQueryInput>;
type ParsedQuery = z.output<typeof transactionQueryInput>;

export interface SqlCondition {
  /** `WHERE ...` or the empty string. Columns use alias `t` for the Transaction. */
  sql: string;
  params: unknown[];
}

/** The filters on a Category: the Category itself and the type of its group. */
export type CategoryFilter = Pick<ParsedQuery, 'categoryId' | 'groupType'>;

/** Placeholders (`$n`) of the Category filters that are set. */
interface CategoryPlaceholders {
  categoryId?: string;
  groupType?: string;
}

/** The Category filters as conditions on one Category column; empty when neither is set. */
function categoryConditions(column: string, placeholders: CategoryPlaceholders): string[] {
  const { categoryId, groupType } = placeholders;
  return [
    ...(categoryId ? [`${column} = ${categoryId}::uuid`] : []),
    ...(groupType
      ? [
          `EXISTS (SELECT 1 FROM category fc JOIN category_group fg ON fg.id = fc.group_id
                   WHERE fc.id = ${column} AND fg.type = ${groupType})`,
        ]
      : []),
  ];
}

/** Adds the set Category filters to `params`, returning their placeholders. */
function categoryPlaceholders(
  input: CategoryFilter,
  param: (value: unknown) => string,
): CategoryPlaceholders {
  return {
    categoryId: input.categoryId === undefined ? undefined : param(input.categoryId),
    groupType: input.groupType === undefined ? undefined : param(input.groupType),
  };
}

/**
 * The Category filters as conditions on a Split line (alias `sl`), with parameters numbered
 * from `$<firstParam>`: the export writes only the Split lines that match.
 */
export function splitLineFilter(
  input: CategoryFilter,
  firstParam: number,
): { conditions: string[]; params: unknown[] } {
  const params: unknown[] = [];
  const placeholders = categoryPlaceholders(input, (value) => {
    params.push(value);
    return `$${firstParam + params.length - 1}`;
  });
  return { conditions: categoryConditions('sl.category_id', placeholders), params };
}

/**
 * The Transaction list's filters as a parameterised WHERE clause, used by the list and the CSV
 * export. The Category filters match a Transaction by its own Category or, for a split
 * Transaction, by any one Split line meeting all of them (ADR-0004).
 */
export function filterConditions(input: ParsedQuery): SqlCondition {
  return buildConditions(input, true);
}

/**
 * The same filters for applying Rules to existing Transactions: the Category filters match the
 * Transaction's own Category only. A split Transaction has none, so Rules, which never classify
 * a split Transaction, don't select it by its Split lines (ADR-0004).
 */
export function ruleFilterConditions(input: ParsedQuery): SqlCondition {
  return buildConditions(input, false);
}

function buildConditions(input: ParsedQuery, matchSplitLines: boolean): SqlCondition {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = (sql: (param: string) => string, value: unknown): void => {
    if (value !== undefined) conditions.push(sql(param(value)));
  };

  where((p) => `t.booking_date >= ${p}::date`, input.from);
  where((p) => `t.booking_date <= ${p}::date`, input.to);
  where((p) => `t.account_id = ${p}::uuid`, input.accountId);
  where((p) => `t.is_manual = ${p}`, input.status && input.status === 'manual');
  where((p) => `t.amount_minor >= ${p}`, input.amountMin);
  where((p) => `t.amount_minor <= ${p}`, input.amountMax);
  where(
    (p) => `t.search_text LIKE '%' || normalize_search_text(${p}) || '%'`,
    input.text && escapeLike(input.text),
  );
  where((p) => `t.payee_id = ${p}::uuid`, input.payeeId);
  const category = categoryPlaceholders(input, param);
  const own = categoryConditions('t.category_id', category).join(' AND ');
  if (own && matchSplitLines) {
    const line = categoryConditions('sl.category_id', category).join(' AND ');
    conditions.push(`((${own}) OR ${splitLineExists(line)})`);
  } else if (own) {
    conditions.push(own);
  }
  where(
    (p) =>
      `EXISTS (SELECT 1 FROM transaction_tag tt WHERE tt.transaction_id = t.id AND tt.tag_id = ${p}::uuid)`,
    input.tagId,
  );
  where((p) => `(${UNCLASSIFIED_CONDITION}) = ${p}`, input.unclassified);
  where((p) => `t.description_key = ${p}`, input.descriptionKey);
  where((p) => `(t.transfer_id IS NOT NULL) = ${p}`, input.transfer && input.transfer === 'only');

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

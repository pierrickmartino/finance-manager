import { z } from 'zod';
import {
  AMOUNT_OPERATORS,
  DATE_OPERATORS,
  DIRECTIONS,
  TEXT_FIELDS,
  TEXT_OPERATORS,
  validateRegex,
  type RuleActions,
  type RuleCondition,
} from './evaluator';

const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_CONDITIONS = 20;
const MAX_LIST_LENGTH = 50;

const amount = z
  .number({ error: 'Amount is required' })
  .int('Amount must be in minor units')
  .refine((value) => Number.isSafeInteger(value), 'Amount is too large');
const isoDate = z.iso.date({ error: 'Date must be a date (YYYY-MM-DD)' });

const textCondition = z
  .object({
    type: z.literal('text'),
    field: z.enum(TEXT_FIELDS, { error: 'Unknown text field' }),
    operator: z.enum(TEXT_OPERATORS, { error: 'Unknown text operator' }),
    value: z
      .string()
      .trim()
      .min(1, 'Condition text is required')
      .max(MAX_TEXT_LENGTH, `Condition text must be at most ${MAX_TEXT_LENGTH} characters`),
  })
  .superRefine((condition, issues) => {
    if (condition.operator !== 'regex') return;
    const problem = validateRegex(condition.value);
    if (problem) issues.addIssue({ code: 'custom', message: problem, path: ['value'] });
  });

const amountCondition = z
  .object({
    type: z.literal('amount'),
    operator: z.enum(AMOUNT_OPERATORS, { error: 'Unknown amount operator' }),
    amountMinor: amount,
    toAmountMinor: amount.optional(),
  })
  .refine((c) => c.operator !== 'between' || c.toAmountMinor !== undefined, {
    message: 'Give both amounts of a "between" condition',
  })
  .refine((c) => c.operator !== 'between' || c.amountMinor <= c.toAmountMinor!, {
    message: 'Give the lowest amount first',
  })
  .transform(({ operator, amountMinor, toAmountMinor }) =>
    operator === 'between'
      ? { type: 'amount' as const, operator, amountMinor, toAmountMinor }
      : { type: 'amount' as const, operator, amountMinor },
  );

const accountCondition = z.object({
  type: z.literal('account'),
  accountIds: z
    .array(z.uuid({ error: 'Account not found' }))
    .min(1, 'Choose at least one Account')
    .max(MAX_LIST_LENGTH)
    .transform((ids) => [...new Set(ids)]),
});

const directionCondition = z.object({
  type: z.literal('direction'),
  direction: z.enum(DIRECTIONS, { error: 'Direction must be money in or money out' }),
});

const dateCondition = z
  .object({
    type: z.literal('bookingDate'),
    operator: z.enum(DATE_OPERATORS, { error: 'Unknown date operator' }),
    date: isoDate,
    toDate: isoDate.optional(),
  })
  .refine((c) => c.operator !== 'between' || c.toDate !== undefined, {
    message: 'Give both dates of a "between" condition',
  })
  .refine((c) => c.operator !== 'between' || c.date <= c.toDate!, {
    message: 'Give the earliest date first',
  })
  .transform(({ operator, date, toDate }) =>
    operator === 'between'
      ? { type: 'bookingDate' as const, operator, date, toDate }
      : { type: 'bookingDate' as const, operator, date },
  );

const condition = z.discriminatedUnion('type', [
  textCondition,
  amountCondition,
  accountCondition,
  directionCondition,
  dateCondition,
]);

const optionalId = z
  .uuid()
  .nullable()
  .optional()
  .transform((id) => id ?? null);

const actions = z
  .object({
    payeeId: optionalId,
    categoryId: optionalId,
    tagIds: z
      .array(z.uuid())
      .max(MAX_LIST_LENGTH)
      .optional()
      .transform((ids) => [...new Set(ids ?? [])]),
  })
  .strict()
  .refine((a) => a.payeeId !== null || a.categoryId !== null || a.tagIds.length > 0, {
    message: 'A Rule needs at least one action: set a Payee, set a Category or add Tags',
  });

export const ruleInput = z.object({
  name: z
    .string({ error: 'Rule name is required' })
    .trim()
    .min(1, 'Rule name is required')
    .max(MAX_NAME_LENGTH, `Rule name must be at most ${MAX_NAME_LENGTH} characters`),
  enabled: z.boolean().default(true),
  conditions: z
    .array(condition)
    .min(1, 'A Rule needs at least one condition')
    .max(MAX_CONDITIONS, `A Rule can have at most ${MAX_CONDITIONS} conditions`),
  actions,
});

/** A Rule as the user writes it. Absent actions mean "don't set". */
export interface RuleInput {
  name: string;
  /** Default true. */
  enabled?: boolean;
  conditions: RuleCondition[];
  actions: Partial<RuleActions>;
}

export type ParsedRuleInput = z.output<typeof ruleInput>;

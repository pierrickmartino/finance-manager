/**
 * The Rule form's draft: what the client form edits and posts as JSON in the `rule` field.
 * Amounts stay as typed text; the server action reads them in the user's number format.
 * Shared by the client form and the server action, so it imports nothing server-only.
 */

export type ConditionKind =
  'description' | 'counterparty' | 'payee' | 'amount' | 'account' | 'direction' | 'bookingDate';

export interface ConditionDraft {
  kind: ConditionKind;
  /** Text: contains/equals/startsWith/regex. Amount: equals/lessThan/greaterThan/between. Date: before/after/between. */
  operator: string;
  /** Text value, amount text, or date. */
  value: string;
  /** Second amount or date of "between". */
  to: string;
  accountIds: string[];
  direction: 'in' | 'out';
}

export interface RuleDraft {
  name: string;
  enabled: boolean;
  conditions: ConditionDraft[];
  payeeId: string;
  categoryId: string;
  tagIds: string[];
}

export const CONDITION_KIND_LABELS: Record<ConditionKind, string> = {
  description: 'Description',
  counterparty: 'Counterparty',
  payee: 'Payee',
  amount: 'Amount',
  account: 'Account',
  direction: 'Direction',
  bookingDate: 'Booking date',
};

type Options = ReadonlyArray<{ value: string; label: string }>;

const TEXT_OPERATOR_OPTIONS: Options = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'regex', label: 'matches regex' },
];

/** The operators of each kind of condition; kinds without operators are absent. */
export const OPERATOR_OPTIONS: Partial<Record<ConditionKind, Options>> = {
  description: TEXT_OPERATOR_OPTIONS,
  counterparty: TEXT_OPERATOR_OPTIONS,
  payee: TEXT_OPERATOR_OPTIONS,
  amount: [
    { value: 'equals', label: '=' },
    { value: 'lessThan', label: '<' },
    { value: 'greaterThan', label: '>' },
    { value: 'between', label: 'between' },
  ],
  bookingDate: [
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'between', label: 'between' },
  ],
};

export function emptyCondition(kind: ConditionKind = 'description'): ConditionDraft {
  return {
    kind,
    operator: OPERATOR_OPTIONS[kind]?.[0]?.value ?? '',
    value: '',
    to: '',
    accountIds: [],
    direction: 'out',
  };
}

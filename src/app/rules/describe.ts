import type { Formatter } from '@/lib/format';
import type { RuleActions, RuleCondition } from '@/server/services/rules';
import { CONDITION_KIND_LABELS, OPERATOR_OPTIONS } from './rule-form-model';
import type { RuleActionPart } from './view';

/** Names the Rules list uses to describe conditions and actions. */
export interface RuleNames {
  accounts: ReadonlyMap<string, string>;
  payees: ReadonlyMap<string, string>;
  categories: ReadonlyMap<string, string>;
  tags: ReadonlyMap<string, string>;
}

function operatorLabel(kind: keyof typeof CONDITION_KIND_LABELS, operator: string): string {
  return OPERATOR_OPTIONS[kind]?.find((option) => option.value === operator)?.label ?? operator;
}

const nameOf = (names: ReadonlyMap<string, string>, id: string) => names.get(id) ?? '(deleted)';

/** One condition in words, e.g. `Description contains "migros"`. */
export function describeCondition(
  condition: RuleCondition,
  names: RuleNames,
  fmt: Formatter,
): string {
  switch (condition.type) {
    case 'text':
      return `${CONDITION_KIND_LABELS[condition.field]} ${operatorLabel(condition.field, condition.operator)} "${condition.value}"`;
    case 'amount': {
      const amount = fmt.amount(condition.amountMinor);
      return condition.operator === 'between'
        ? `Amount between ${amount} and ${fmt.amount(condition.toAmountMinor ?? condition.amountMinor)}`
        : `Amount ${operatorLabel('amount', condition.operator)} ${amount}`;
    }
    case 'account': {
      const accounts = condition.accountIds.map((id) => nameOf(names.accounts, id)).join(', ');
      return condition.accountIds.length === 1
        ? `Account is ${accounts}`
        : `Account is one of ${accounts}`;
    }
    case 'direction':
      return condition.direction === 'in' ? 'Money in' : 'Money out';
    case 'bookingDate':
      return condition.operator === 'between'
        ? `Booked between ${fmt.date(condition.date)} and ${fmt.date(condition.toDate ?? condition.date)}`
        : `Booked ${condition.operator} ${fmt.date(condition.date)}`;
  }
}

/**
 * What the Rule sets, one part each, e.g. `Payee: Migros`, `Category: Food › Groceries`,
 * `Tag: food`.
 */
export function describeActions(actions: RuleActions, names: RuleNames): RuleActionPart[] {
  return [
    ...(actions.payeeId
      ? [{ kind: 'payee' as const, label: `Payee: ${nameOf(names.payees, actions.payeeId)}` }]
      : []),
    ...(actions.categoryId
      ? [
          {
            kind: 'category' as const,
            label: `Category: ${nameOf(names.categories, actions.categoryId)}`,
          },
        ]
      : []),
    ...actions.tagIds.map((id) => ({
      kind: 'tag' as const,
      label: `Tag: ${nameOf(names.tags, id)}`,
    })),
  ];
}

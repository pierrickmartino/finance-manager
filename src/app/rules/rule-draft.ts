import type { Formatter, NumberFormat } from '@/lib/format';
import { parseAmount } from '@/lib/format/parse-amount';
import type { Rule, RuleCondition, RuleInput } from '@/server/services/rules';
import { emptyCondition, type ConditionDraft, type RuleDraft } from './rule-form-model';

/** Converts between the form's draft and the service's Rule. Pure; used on both sides. */

export class DraftError extends Error {}

function amountOf(text: string, numberFormat: NumberFormat): number {
  const value = parseAmount(text.trim(), numberFormat);
  if (value === null) throw new DraftError(`"${text}" is not an amount`);
  return value;
}

function conditionOf(draft: ConditionDraft, numberFormat: NumberFormat): RuleCondition {
  switch (draft.kind) {
    case 'description':
    case 'counterparty':
    case 'payee':
      return {
        type: 'text',
        field: draft.kind,
        operator: draft.operator as Extract<RuleCondition, { type: 'text' }>['operator'],
        value: draft.value,
      };
    case 'amount': {
      const operator = draft.operator as Extract<RuleCondition, { type: 'amount' }>['operator'];
      const amountMinor = amountOf(draft.value, numberFormat);
      return operator === 'between'
        ? { type: 'amount', operator, amountMinor, toAmountMinor: amountOf(draft.to, numberFormat) }
        : { type: 'amount', operator, amountMinor };
    }
    case 'account':
      return { type: 'account', accountIds: draft.accountIds };
    case 'direction':
      return { type: 'direction', direction: draft.direction };
    case 'bookingDate': {
      const operator = draft.operator as Extract<
        RuleCondition,
        { type: 'bookingDate' }
      >['operator'];
      return operator === 'between'
        ? { type: 'bookingDate', operator, date: draft.value, toDate: draft.to }
        : { type: 'bookingDate', operator, date: draft.value };
    }
  }
}

/** The Rule a draft describes. Throws DraftError for an amount that can't be read. */
export function draftToRuleInput(draft: RuleDraft, numberFormat: NumberFormat): RuleInput {
  return {
    name: draft.name,
    enabled: draft.enabled,
    conditions: draft.conditions.map((condition) => conditionOf(condition, numberFormat)),
    actions: {
      payeeId: draft.payeeId || null,
      categoryId: draft.categoryId || null,
      tagIds: draft.tagIds,
    },
  };
}

function draftOf(condition: RuleCondition, fmt: Formatter): ConditionDraft {
  switch (condition.type) {
    case 'text':
      return {
        ...emptyCondition(condition.field),
        operator: condition.operator,
        value: condition.value,
      };
    case 'amount':
      return {
        ...emptyCondition('amount'),
        operator: condition.operator,
        value: fmt.amount(condition.amountMinor),
        to: condition.toAmountMinor === undefined ? '' : fmt.amount(condition.toAmountMinor),
      };
    case 'account':
      return { ...emptyCondition('account'), accountIds: condition.accountIds };
    case 'direction':
      return { ...emptyCondition('direction'), direction: condition.direction };
    case 'bookingDate':
      return {
        ...emptyCondition('bookingDate'),
        operator: condition.operator,
        value: condition.date,
        to: condition.toDate ?? '',
      };
  }
}

/** The draft to edit an existing Rule, or a blank one. */
export function ruleToDraft(rule: Rule | null, fmt: Formatter): RuleDraft {
  if (!rule) {
    return {
      name: '',
      enabled: true,
      conditions: [emptyCondition()],
      payeeId: '',
      categoryId: '',
      tagIds: [],
    };
  }
  return {
    name: rule.name,
    enabled: rule.enabled,
    conditions: rule.conditions.map((condition) => draftOf(condition, fmt)),
    payeeId: rule.actions.payeeId ?? '',
    categoryId: rule.actions.categoryId ?? '',
    tagIds: rule.actions.tagIds,
  };
}

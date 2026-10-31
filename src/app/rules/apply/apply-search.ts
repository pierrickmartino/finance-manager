import type { ApplyRulesInput } from '@/server/services/rules';

/** The apply page's URL parameters (a GET form): the Rule, if one, and which Transactions. */
export const APPLY_FIELDS = ['ruleId', 'accountId', 'from', 'to', 'text', 'unclassified'] as const;

export type ApplyValues = Record<(typeof APPLY_FIELDS)[number], string>;

type Params = Record<string, string | string[] | undefined>;

export function readApplyValues(params: Params): ApplyValues {
  return Object.fromEntries(
    APPLY_FIELDS.map((field) => {
      const value = params[field];
      return [field, typeof value === 'string' ? value.trim() : ''];
    }),
  ) as ApplyValues;
}

/** The service input the values describe; the service validates them. */
export function applyInputOf(values: ApplyValues): ApplyRulesInput {
  return {
    ruleIds: values.ruleId ? [values.ruleId] : undefined,
    filter: {
      accountId: values.accountId,
      from: values.from,
      to: values.to,
      text: values.text,
      unclassified: values.unclassified === 'true' ? true : undefined,
    },
  };
}

import { describe, expect, it } from 'vitest';
import {
  compileRules,
  evaluateRules,
  ruleMatches,
  validateRegex,
  type RuleCondition,
  type RuleDefinition,
  type RuleSubject,
} from './evaluator';

const subject = (overrides: Partial<RuleSubject> = {}): RuleSubject => ({
  accountId: 'account-1',
  bookingDate: '2025-10-03',
  amountMinor: -4590,
  rawDescription: 'Achat MIGROS  Genève',
  counterpartyName: 'Migros Genossenschaft',
  payee: null,
  lockedFields: [],
  isInTransfer: false,
  ...overrides,
});

let nextId = 0;
const rule = (
  conditions: RuleCondition[],
  actions: Partial<RuleDefinition['actions']> = {},
  overrides: Partial<RuleDefinition> = {},
): RuleDefinition => {
  nextId += 1;
  return {
    id: `rule-${nextId}`,
    name: `Rule ${nextId}`,
    enabled: true,
    conditions,
    actions: { payeeId: null, categoryId: null, tagIds: [], ...actions },
    ...overrides,
  };
};

const contains = (value: string, field: 'description' | 'counterparty' | 'payee' = 'description') =>
  ({ type: 'text', field, operator: 'contains', value }) as const;

const evaluate = (
  rules: RuleDefinition[],
  s: RuleSubject = subject(),
  payeeNames: Record<string, string> = {},
) => evaluateRules(compileRules(rules, { payeeNames: new Map(Object.entries(payeeNames)) }), s);

const matches = (condition: RuleCondition, s: RuleSubject = subject()) =>
  ruleMatches(compileRules([rule([condition])]).rules[0]!, s);

describe('rule evaluation: precedence', () => {
  it('gives each field to the first matching Rule that sets it', () => {
    const first = rule([contains('migros')], { categoryId: 'groceries' });
    const second = rule([contains('genève')], { categoryId: 'shopping', payeeId: 'migros' });

    const result = evaluate([first, second]);

    expect(result.category).toEqual({ id: 'groceries', ruleId: first.id });
    expect(result.payee).toEqual({ id: 'migros', ruleId: second.id });
    expect(result.matchedRuleIds).toEqual([first.id, second.id]);
  });

  it('lets a later Rule fill a field no earlier Rule set', () => {
    const first = rule([contains('migros')], { payeeId: 'migros' });
    const second = rule([contains('migros')], { payeeId: 'coop', categoryId: 'groceries' });

    const result = evaluate([first, second]);

    expect(result.payee).toEqual({ id: 'migros', ruleId: first.id });
    expect(result.category).toEqual({ id: 'groceries', ruleId: second.id });
  });

  it('accumulates Tags across Rules, crediting the first Rule that added each', () => {
    const first = rule([contains('migros')], { tagIds: ['food', 'family'] });
    const second = rule([contains('migros')], { tagIds: ['family', 'weekly'] });

    expect(evaluate([first, second]).tags).toEqual([
      { id: 'food', ruleId: first.id },
      { id: 'family', ruleId: first.id },
      { id: 'weekly', ruleId: second.id },
    ]);
  });

  it('ignores disabled Rules', () => {
    const disabled = rule([contains('migros')], { categoryId: 'shopping' }, { enabled: false });
    const enabled = rule([contains('migros')], { categoryId: 'groceries' });

    const result = evaluate([disabled, enabled]);

    expect(result.category).toEqual({ id: 'groceries', ruleId: enabled.id });
    expect(result.matchedRuleIds).toEqual([enabled.id]);
  });

  it('combines conditions with AND', () => {
    const both = rule([contains('migros'), { type: 'direction', direction: 'in' }], {
      categoryId: 'refunds',
    });

    expect(evaluate([both]).category).toBeNull();
    expect(evaluate([both], subject({ amountMinor: 4590 })).category?.id).toBe('refunds');
  });

  it('never writes a locked field, and the next unlocked field still applies', () => {
    const first = rule([contains('migros')], {
      payeeId: 'migros',
      categoryId: 'groceries',
      tagIds: ['food'],
    });

    const result = evaluate([first], subject({ lockedFields: ['payee', 'tags'] }));

    expect(result.payee).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.category).toEqual({ id: 'groceries', ruleId: first.id });
  });

  it('skips a Transaction that is part of a Transfer', () => {
    const first = rule([contains('migros')], { categoryId: 'groceries', tagIds: ['food'] });

    expect(evaluate([first], subject({ isInTransfer: true }))).toEqual({
      skipped: 'transfer',
      payee: null,
      category: null,
      tags: [],
      matchedRuleIds: [],
    });
  });

  it('matches a Payee condition against the Payee an earlier Rule set', () => {
    const setsPayee = rule([contains('migros')], { payeeId: 'p-migros' });
    const byPayee = rule([contains('Migros', 'payee')], { categoryId: 'groceries' });

    const result = evaluate([setsPayee, byPayee], subject(), { 'p-migros': 'Migros' });

    expect(result.category).toEqual({ id: 'groceries', ruleId: byPayee.id });
  });

  it("matches a Payee condition against the Transaction's own Payee", () => {
    const byPayee = rule([contains('coop', 'payee')], { categoryId: 'groceries' });

    expect(evaluate([byPayee]).category).toBeNull();
    expect(evaluate([byPayee], subject({ payee: { id: 'p', name: 'Coop City' } })).category).toEqual(
      { id: 'groceries', ruleId: byPayee.id },
    );
  });
});

describe('rule evaluation: text conditions', () => {
  it.each([
    ['contains', 'migros genève', true],
    ['contains', 'MIGROS GENEVE', true],
    ['contains', 'migros   geneve', true],
    ['contains', 'coop', false],
    ['equals', 'achat migros geneve', true],
    ['equals', 'migros', false],
    ['startsWith', 'ACHAT', true],
    ['startsWith', 'migros', false],
    ['regex', '^achat\\s+migros', true],
    ['regex', 'GENÈVE$', true],
    ['regex', '^migros', false],
  ] as const)('%s "%s" on the description: %s', (operator, value, expected) => {
    expect(matches({ type: 'text', field: 'description', operator, value })).toBe(expected);
  });

  it('matches the counterparty name', () => {
    expect(matches(contains('genossenschaft', 'counterparty'))).toBe(true);
    expect(matches(contains('genossenschaft', 'counterparty'), subject({ counterpartyName: null })))
      .toBe(false);
  });
});

describe('rule evaluation: amount, Account, direction and date conditions', () => {
  it.each([
    [{ operator: 'equals', amountMinor: -4590 }, true],
    [{ operator: 'equals', amountMinor: 4590 }, false],
    [{ operator: 'lessThan', amountMinor: -4000 }, true],
    [{ operator: 'lessThan', amountMinor: -4590 }, false],
    [{ operator: 'greaterThan', amountMinor: -5000 }, true],
    [{ operator: 'greaterThan', amountMinor: -4590 }, false],
    [{ operator: 'between', amountMinor: -5000, toAmountMinor: -4590 }, true],
    [{ operator: 'between', amountMinor: -4590, toAmountMinor: -1 }, true],
    [{ operator: 'between', amountMinor: -4589, toAmountMinor: 0 }, false],
  ] as const)('amount %o: %s', (condition, expected) => {
    expect(matches({ type: 'amount', ...condition })).toBe(expected);
  });

  it('matches an Account that is one of the given ones', () => {
    expect(matches({ type: 'account', accountIds: ['account-1'] })).toBe(true);
    expect(matches({ type: 'account', accountIds: ['account-2', 'account-1'] })).toBe(true);
    expect(matches({ type: 'account', accountIds: ['account-2'] })).toBe(false);
  });

  it('matches money in or out', () => {
    expect(matches({ type: 'direction', direction: 'out' })).toBe(true);
    expect(matches({ type: 'direction', direction: 'in' })).toBe(false);
    expect(matches({ type: 'direction', direction: 'in' }, subject({ amountMinor: 1 }))).toBe(true);
  });

  it.each([
    [{ operator: 'before', date: '2025-10-04' }, true],
    [{ operator: 'before', date: '2025-10-03' }, false],
    [{ operator: 'after', date: '2025-10-02' }, true],
    [{ operator: 'after', date: '2025-10-03' }, false],
    [{ operator: 'between', date: '2025-10-03', toDate: '2025-10-31' }, true],
    [{ operator: 'between', date: '2025-09-01', toDate: '2025-10-03' }, true],
    [{ operator: 'between', date: '2025-10-04', toDate: '2025-10-31' }, false],
  ] as const)('booking date %o: %s', (condition, expected) => {
    expect(matches({ type: 'bookingDate', ...condition })).toBe(expected);
  });
});

describe('regex guard', () => {
  it('accepts an ordinary pattern', () => {
    expect(validateRegex('^(migros|coop)\\b.*\\d{4}')).toBeNull();
  });

  it.each([
    ['(a+)+$', /nested/i],
    ['(\\w*)*x', /nested/i],
    ['((ab)+c)*', /nested/i],
    ['(', /not a valid/i],
    ['a'.repeat(201), /at most 200/i],
  ])('rejects %s', (pattern, message) => {
    expect(validateRegex(pattern)).toMatch(message);
  });

  it('never matches with a pattern that fails the guard', () => {
    expect(matches({ type: 'text', field: 'description', operator: 'regex', value: '(a+)+' })).toBe(
      false,
    );
  });
});

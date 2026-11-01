import { describe, expect, test } from 'vitest';
import { filterRules, moved, ruleHref, selectRule, type RuleSummary } from './view';

function rule(name: string, extra: Partial<RuleSummary> = {}): RuleSummary {
  return { id: `r-${name}`, name, conditions: [], actions: [], ...extra };
}

describe('moved', () => {
  test('moves an id up to where the target is', () => {
    expect(moved(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  test('moves an id down to where the target is', () => {
    expect(moved(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  test('leaves the input untouched', () => {
    const ids = ['a', 'b'];
    moved(ids, 'b', 'a');
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('filterRules', () => {
  const rules = [
    rule('Migros', {
      conditions: ['Description contains "migros"'],
      actions: [{ kind: 'category', label: 'Category: Food › Groceries' }],
    }),
    rule('SBB', { conditions: ['Description matches regex "sbb"'] }),
    rule('Café Rose'),
  ];

  test('keeps every Rule for an empty or blank query', () => {
    expect(filterRules(rules, '')).toHaveLength(3);
    expect(filterRules(rules, '  ')).toHaveLength(3);
  });

  test('matches the name, ignoring case', () => {
    expect(filterRules(rules, 'sbb').map((r) => r.name)).toEqual(['SBB']);
  });

  test('matches a condition or what the Rule sets', () => {
    expect(filterRules(rules, 'groceries').map((r) => r.name)).toEqual(['Migros']);
    expect(filterRules(rules, 'regex').map((r) => r.name)).toEqual(['SBB']);
  });

  test('ignores accents on both sides', () => {
    expect(filterRules(rules, 'cafe').map((r) => r.name)).toEqual(['Café Rose']);
  });

  test('keeps the run order', () => {
    expect(filterRules(rules, 'description').map((r) => r.name)).toEqual(['Migros', 'SBB']);
  });
});

describe('selectRule', () => {
  const rules = [rule('A'), rule('B'), rule('C')];
  const visible = [rules[1]!, rules[2]!];

  test('returns the Rule the URL names, even when the filter hides it', () => {
    expect(selectRule(rules, visible, 'r-A')?.name).toBe('A');
  });

  test('falls back to the first shown Rule', () => {
    expect(selectRule(rules, visible, undefined)?.name).toBe('B');
    expect(selectRule(rules, visible, 'r-gone')?.name).toBe('B');
  });

  test('returns nothing when no Rule is shown', () => {
    expect(selectRule(rules, [], undefined)).toBeUndefined();
  });
});

describe('ruleHref', () => {
  test('opens the Rule', () => {
    expect(ruleHref('r1', '')).toBe('/rules?rule=r1');
  });

  test('keeps the filter', () => {
    expect(ruleHref('r1', 'coop shop')).toBe('/rules?rule=r1&q=coop+shop');
  });
});

import { describe, expect, test } from 'vitest';
import {
  filterRules,
  groupRules,
  moved,
  parseGroupBy,
  ruleHref,
  selectRule,
  type RuleGrouping,
  type RuleSummary,
} from './view';

const UNGROUPED: RuleGrouping = { payee: null, category: null };

function rule(name: string, extra: Partial<RuleSummary> = {}): RuleSummary {
  return { id: `r-${name}`, name, conditions: [], actions: [], grouping: UNGROUPED, ...extra };
}

const payee = (id: string, name: string) => ({ id, name, parent: null });
const category = (id: string, parent: string, name: string) => ({ id, name, parent });

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

  test('keeps grouping by Category, and leaves the default Payee grouping out', () => {
    expect(ruleHref('r1', '', 'category')).toBe('/rules?rule=r1&group=category');
    expect(ruleHref('r1', '', 'payee')).toBe('/rules?rule=r1');
  });
});

describe('parseGroupBy', () => {
  test('reads category, and falls back to payee for anything else', () => {
    expect(parseGroupBy('category')).toBe('category');
    expect(parseGroupBy('payee')).toBe('payee');
    expect(parseGroupBy(undefined)).toBe('payee');
    expect(parseGroupBy('tag')).toBe('payee');
  });
});

describe('groupRules', () => {
  const migros = payee('p-migros', 'Migros');
  const coop = payee('p-coop', 'Coop');
  const groceries = category('c-groceries', 'Food', 'Groceries');
  const fuel = category('c-fuel', 'Transport', 'Fuel');
  const rules = [
    rule('Migros 1', { grouping: { payee: migros, category: groceries } }),
    rule('Card tag'),
    rule('Coop fuel', { grouping: { payee: coop, category: fuel } }),
    rule('Migros 2', { grouping: { payee: migros, category: null } }),
    rule('Coop shop', { grouping: { payee: coop, category: groceries } }),
  ];
  const summary = (by: 'payee' | 'category') =>
    groupRules(rules, by).map((group) => [group.name, group.rules.map((r) => r.name)]);

  test('groups by Payee A–Z, keeping the run order inside each group', () => {
    expect(summary('payee')).toEqual([
      ['Coop', ['Coop fuel', 'Coop shop']],
      ['Migros', ['Migros 1', 'Migros 2']],
      [null, ['Card tag']],
    ]);
  });

  test('groups by Category, sorted by Category Group then Category, unset last', () => {
    expect(summary('category')).toEqual([
      ['Groceries', ['Migros 1', 'Coop shop']],
      ['Fuel', ['Coop fuel']],
      [null, ['Card tag', 'Migros 2']],
    ]);
    expect(groupRules(rules, 'category')[0]).toMatchObject({ key: 'c-groceries', parent: 'Food' });
  });

  test('keeps same-named Categories of different Category Groups apart', () => {
    const other = category('c-other', 'Gifts', 'Groceries');
    const grouped = groupRules(
      [
        rule('A', { grouping: { payee: null, category: groceries } }),
        rule('B', { grouping: { payee: null, category: other } }),
      ],
      'category',
    );
    expect(grouped.map((group) => [group.parent, group.name])).toEqual([
      ['Food', 'Groceries'],
      ['Gifts', 'Groceries'],
    ]);
  });

  test('is empty without Rules', () => {
    expect(groupRules([], 'payee')).toEqual([]);
  });
});

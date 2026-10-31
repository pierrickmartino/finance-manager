import { normalizeText } from '@/lib/text';

/**
 * The Rules engine's pure evaluator (spec: "Rules engine"). No database, no clock: give it the
 * ordered Rules and one Transaction, get back which Payee, Category and Tags the Rules assign
 * and which Rule assigned each. The import preview, saving a Manual transaction and
 * apply-to-existing (#18) all go through `compileRules` + `evaluateRules`; match counts (#18)
 * use `ruleMatches`.
 *
 * Semantics (spec 76-77, domain rules):
 * - Rules run in the given order; disabled Rules are ignored.
 * - Per field, the first matching Rule that sets it wins; later Rules still fill fields no
 *   earlier Rule set. Tags accumulate across Rules.
 * - Locked fields are never assigned.
 * - A Transaction that is part of a Transfer gets nothing.
 * - Text is compared normalised: lower case, accents stripped, whitespace collapsed.
 */

export const TEXT_FIELDS = ['description', 'counterparty', 'payee'] as const;
export type TextField = (typeof TEXT_FIELDS)[number];
export const TEXT_OPERATORS = ['contains', 'equals', 'startsWith', 'regex'] as const;
export type TextOperator = (typeof TEXT_OPERATORS)[number];
export const AMOUNT_OPERATORS = ['equals', 'lessThan', 'greaterThan', 'between'] as const;
export type AmountOperator = (typeof AMOUNT_OPERATORS)[number];
export const DATE_OPERATORS = ['before', 'after', 'between'] as const;
export type DateOperator = (typeof DATE_OPERATORS)[number];
export const DIRECTIONS = ['in', 'out'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type RuleCondition =
  | { type: 'text'; field: TextField; operator: TextOperator; value: string }
  /** Signed minor units in the Account's Currency. `between` is inclusive. */
  | { type: 'amount'; operator: AmountOperator; amountMinor: number; toAmountMinor?: number }
  /** "is" is a one-element list, "is one of" a longer one. */
  | { type: 'account'; accountIds: string[] }
  /** `in`: amount > 0, `out`: amount < 0. */
  | { type: 'direction'; direction: Direction }
  /** ISO dates. `before`/`after` are strict, `between` inclusive. */
  | { type: 'bookingDate'; operator: DateOperator; date: string; toDate?: string };

export interface RuleActions {
  payeeId: string | null;
  categoryId: string | null;
  /** Tags to add. */
  tagIds: string[];
}

/** A Rule as the evaluator sees it. The caller passes Rules in their run order. */
export interface RuleDefinition {
  id: string;
  name: string;
  enabled: boolean;
  /** Combined with AND. */
  conditions: RuleCondition[];
  actions: RuleActions;
}

/** The Transaction fields Rules look at. */
export interface RuleSubject {
  accountId: string;
  bookingDate: string;
  amountMinor: number;
  rawDescription: string;
  counterpartyName: string | null;
  /** The Transaction's current Payee (null for a new entry). */
  payee: { id: string; name: string } | null;
  /** Classification field names (`payee`, `category`, `tags`, `notes`) Rules may not write. */
  lockedFields: readonly string[];
  isInTransfer: boolean;
}

/** One value a Rule assigns, and the Rule that assigned it. */
export interface RuleAssignment {
  id: string;
  ruleId: string;
}

export interface RuleEvaluation {
  /** `transfer`: the Transaction is part of a Transfer and Rules left it alone. */
  skipped: 'transfer' | null;
  payee: RuleAssignment | null;
  category: RuleAssignment | null;
  /** Tags to add, in the order Rules added them. */
  tags: RuleAssignment[];
  /** Every enabled Rule whose conditions matched, in order. */
  matchedRuleIds: string[];
}

export interface CompiledRule {
  readonly definition: RuleDefinition;
  readonly test: (subject: RuleSubject, payeeName: string | null) => boolean;
}

/** Rules ready to evaluate many Transactions (regexes are compiled once). */
export interface CompiledRules {
  readonly rules: readonly CompiledRule[];
  /** Payee names by id, so Payee conditions see a Payee an earlier Rule set. */
  readonly payeeNames: ReadonlyMap<string, string>;
}

export const MAX_REGEX_LENGTH = 200;
/** Regexes only see this much of a text, which bounds the work any pattern can do. */
export const MAX_REGEX_SUBJECT_LENGTH = 1000;

/** Strips accents without changing anything else (safe on regex syntax). */
const stripAccents = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Whether the pattern repeats a group that itself contains a repetition, as in `(a+)+`: the
 * classic shape of catastrophic backtracking. A light scanner, not a full regex parser.
 */
function hasNestedQuantifier(pattern: string): boolean {
  const groups: boolean[] = [false];
  let inClass = false;
  let index = 0;
  const repeatsAt = (at: number): boolean => {
    const char = pattern[at];
    return char === '*' || char === '+' || (char === '{' && /^\{\d*,\d*\}/.test(pattern.slice(at)));
  };
  while (index < pattern.length) {
    const char = pattern[index]!;
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
    } else if (char === '[') {
      inClass = true;
    } else if (char === '(') {
      groups.push(false);
    } else if (char === ')' && groups.length > 1) {
      const innerRepeats = groups.pop()!;
      const repeated = repeatsAt(index + 1);
      if (innerRepeats && repeated) return true;
      groups[groups.length - 1] ||= innerRepeats || repeated;
    } else if (repeatsAt(index)) {
      groups[groups.length - 1] = true;
    }
    index += 1;
  }
  return false;
}

/**
 * Why a regex can't be used in a Rule, or null when it can. Rules are checked when saved;
 * the evaluator also refuses (never matches) a pattern that fails this check.
 */
export function validateRegex(pattern: string): string | null {
  if (pattern.length > MAX_REGEX_LENGTH) {
    return `A regular expression must be at most ${MAX_REGEX_LENGTH} characters`;
  }
  try {
    new RegExp(pattern, 'i');
  } catch {
    return `"${pattern}" is not a valid regular expression`;
  }
  if (hasNestedQuantifier(pattern)) {
    return 'This regular expression has nested repetition (like "(a+)+"), which can take forever to run: simplify it';
  }
  return null;
}

type TextTest = (text: string) => boolean;

function compileText(operator: TextOperator, value: string): TextTest {
  if (operator === 'regex') {
    if (validateRegex(value) !== null) return () => false;
    const regex = new RegExp(stripAccents(value), 'i');
    return (text) => regex.test(text.slice(0, MAX_REGEX_SUBJECT_LENGTH));
  }
  const expected = normalizeText(value);
  switch (operator) {
    case 'contains':
      return (text) => text.includes(expected);
    case 'equals':
      return (text) => text === expected;
    case 'startsWith':
      return (text) => text.startsWith(expected);
  }
}

type ConditionTest = (subject: RuleSubject, payeeName: string | null) => boolean;

function textOf(field: TextField, subject: RuleSubject, payeeName: string | null): string | null {
  switch (field) {
    case 'description':
      return subject.rawDescription;
    case 'counterparty':
      return subject.counterpartyName;
    case 'payee':
      return payeeName;
  }
}

function compileCondition(condition: RuleCondition): ConditionTest {
  switch (condition.type) {
    case 'text': {
      const test = compileText(condition.operator, condition.value);
      return (subject, payeeName) => {
        const text = textOf(condition.field, subject, payeeName);
        return text !== null && test(normalizeText(text));
      };
    }
    case 'amount': {
      const { operator, amountMinor, toAmountMinor } = condition;
      return ({ amountMinor: amount }) => {
        switch (operator) {
          case 'equals':
            return amount === amountMinor;
          case 'lessThan':
            return amount < amountMinor;
          case 'greaterThan':
            return amount > amountMinor;
          case 'between':
            return amount >= amountMinor && amount <= (toAmountMinor ?? amountMinor);
        }
      };
    }
    case 'account': {
      const ids = new Set(condition.accountIds);
      return ({ accountId }) => ids.has(accountId);
    }
    case 'direction':
      return ({ amountMinor }) =>
        condition.direction === 'in' ? amountMinor > 0 : amountMinor < 0;
    case 'bookingDate': {
      const { operator, date, toDate } = condition;
      return ({ bookingDate }) => {
        switch (operator) {
          case 'before':
            return bookingDate < date;
          case 'after':
            return bookingDate > date;
          case 'between':
            return bookingDate >= date && bookingDate <= (toDate ?? date);
        }
      };
    }
  }
}

function compileRule(definition: RuleDefinition): CompiledRule {
  const tests = definition.conditions.map(compileCondition);
  return {
    definition,
    test: (subject, payeeName) => tests.every((test) => test(subject, payeeName)),
  };
}

/** Compiles Rules, kept in the given order, for `evaluateRules` and `ruleMatches`. */
export function compileRules(
  rules: readonly RuleDefinition[],
  { payeeNames = new Map() }: { payeeNames?: ReadonlyMap<string, string> } = {},
): CompiledRules {
  return { rules: rules.map(compileRule), payeeNames };
}

/**
 * Whether one Rule's conditions match the Transaction as it stands (enabled or not), for
 * match counts.
 */
export function ruleMatches(rule: CompiledRule, subject: RuleSubject): boolean {
  return !subject.isInTransfer && rule.test(subject, subject.payee?.name ?? null);
}

const NOTHING: RuleEvaluation = {
  skipped: null,
  payee: null,
  category: null,
  tags: [],
  matchedRuleIds: [],
};

/** Runs the Rules, in order, on one Transaction. See the module comment for the semantics. */
export function evaluateRules(compiled: CompiledRules, subject: RuleSubject): RuleEvaluation {
  if (subject.isInTransfer) return { ...NOTHING, skipped: 'transfer' };
  const locked = new Set(subject.lockedFields);
  let payee: RuleAssignment | null = null;
  let category: RuleAssignment | null = null;
  const tags: RuleAssignment[] = [];
  const matchedRuleIds: string[] = [];

  for (const { definition, test } of compiled.rules) {
    if (!definition.enabled) continue;
    const payeeName = payee
      ? (compiled.payeeNames.get(payee.id) ?? null)
      : (subject.payee?.name ?? null);
    if (!test(subject, payeeName)) continue;
    matchedRuleIds.push(definition.id);
    const { actions, id: ruleId } = definition;
    if (!payee && actions.payeeId && !locked.has('payee')) payee = { id: actions.payeeId, ruleId };
    if (!category && actions.categoryId && !locked.has('category')) {
      category = { id: actions.categoryId, ruleId };
    }
    if (!locked.has('tags')) {
      for (const tagId of actions.tagIds) {
        if (!tags.some((tag) => tag.id === tagId)) tags.push({ id: tagId, ruleId });
      }
    }
  }
  return { skipped: null, payee, category, tags, matchedRuleIds };
}

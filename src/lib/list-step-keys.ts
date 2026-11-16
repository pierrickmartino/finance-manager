/** Which way a key steps through the Transactions list from a Transaction detail. */
export type ListStep = 'next' | 'previous';

/** The parts of a `KeyboardEvent` that decide a step, so the rule is testable without a DOM. */
export interface ListStepKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

/** The keys shown as hints on the Previous / Next controls. */
export const LIST_STEP_KEYS: Readonly<Record<ListStep, string>> = { next: 'j', previous: 'k' };

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * `j` steps to the next Transaction and `k` to the previous one (spec #152, stories 8-11).
 * Nothing while typing in a field, a picker or a select, or with any modifier held, so a Payee,
 * Tag or note is never cut short by a navigation and browser shortcuts stay the browser's.
 */
export function listStepFor(event: ListStepKeyEvent): ListStep | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) {
    return null;
  }
  const target = event.target;
  if (target?.isContentEditable || TYPING_TAGS.has(target?.tagName ?? '')) return null;
  if (event.key === LIST_STEP_KEYS.next) return 'next';
  if (event.key === LIST_STEP_KEYS.previous) return 'previous';
  return null;
}

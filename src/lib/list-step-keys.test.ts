import { describe, expect, it } from 'vitest';
import { listStepFor, type ListStepKeyEvent } from './list-step-keys';

const press = (key: string, overrides: Partial<ListStepKeyEvent> = {}): ListStepKeyEvent => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  target: { tagName: 'BODY', isContentEditable: false },
  ...overrides,
});

describe('listStepFor', () => {
  it('steps to the next Transaction on j and the previous one on k', () => {
    expect(listStepFor(press('j'))).toBe('next');
    expect(listStepFor(press('k'))).toBe('previous');
  });

  it('ignores every other key, and capital J / K', () => {
    expect(listStepFor(press('l'))).toBeNull();
    expect(listStepFor(press('ArrowDown'))).toBeNull();
    expect(listStepFor(press('J', { shiftKey: true }))).toBeNull();
  });

  it('does nothing with Ctrl, Cmd, Alt or Shift held', () => {
    expect(listStepFor(press('j', { ctrlKey: true }))).toBeNull();
    expect(listStepFor(press('k', { metaKey: true }))).toBeNull();
    expect(listStepFor(press('j', { altKey: true }))).toBeNull();
    expect(listStepFor(press('k', { shiftKey: true }))).toBeNull();
  });

  it('does nothing while typing in an input, textarea, select or editable element', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(listStepFor(press('j', { target: { tagName, isContentEditable: false } }))).toBeNull();
    }
    expect(
      listStepFor(press('k', { target: { tagName: 'DIV', isContentEditable: true } })),
    ).toBeNull();
  });

  it('still steps while focus is on a link or button', () => {
    expect(listStepFor(press('j', { target: { tagName: 'A', isContentEditable: false } }))).toBe(
      'next',
    );
    expect(
      listStepFor(press('k', { target: { tagName: 'BUTTON', isContentEditable: false } })),
    ).toBe('previous');
  });

  it('does nothing for a key already handled, such as during IME composition', () => {
    expect(listStepFor(press('j', { isComposing: true }))).toBeNull();
  });
});

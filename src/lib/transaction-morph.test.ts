import { describe, expect, test } from 'vitest';
import { isMorphing } from './transaction-morph';

describe('isMorphing', () => {
  test('the Transaction detail header always morphs, whatever the width', () => {
    expect(isMorphing('detail', true)).toBe(true);
    expect(isMorphing('detail', false)).toBe(true);
    expect(isMorphing('detail', null)).toBe(true);
  });

  test('below xl the row morphs, not the Transaction preview', () => {
    expect(isMorphing('row', false)).toBe(true);
    expect(isMorphing('preview', false)).toBe(false);
  });

  test('from xl up the Transaction preview morphs, not the row', () => {
    expect(isMorphing('preview', true)).toBe(true);
    expect(isMorphing('row', true)).toBe(false);
  });

  test('before the width is known, neither the row nor the preview morphs', () => {
    expect(isMorphing('row', null)).toBe(false);
    expect(isMorphing('preview', null)).toBe(false);
  });
});

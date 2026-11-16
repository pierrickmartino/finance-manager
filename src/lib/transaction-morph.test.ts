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

  test('opened from the Transactions list, the loading skeleton morphs, whatever the width', () => {
    expect(isMorphing('loading', true)).toBe(true);
    expect(isMorphing('loading', false)).toBe(true);
    expect(isMorphing('loading', null)).toBe(true);
  });

  test('stepping from another Transaction detail, the loading skeleton does not morph', () => {
    // Named, its swap for the page's header would pair the two and morph (spec #152, story 33).
    expect(isMorphing('loading', true, { fromDetail: true })).toBe(false);
    expect(isMorphing('loading', false, { fromDetail: true })).toBe(false);
    expect(isMorphing('loading', null, { fromDetail: true })).toBe(false);
  });

  test('the Transaction detail header morphs even when reached from another detail', () => {
    expect(isMorphing('detail', false, { fromDetail: true })).toBe(true);
  });
});

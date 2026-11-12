import { describe, expect, it } from 'vitest';
import { addMonths } from './dates';

describe('addMonths', () => {
  it('keeps the day of the month when the target month has it', () => {
    expect(addMonths('2025-03-05', 1)).toBe('2025-04-05');
  });

  it('clamps 31 January to the end of February', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
  });

  it('clamps to 29 February in a leap year', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('clamps the 31st to the 30th of a 30-day month', () => {
    expect(addMonths('2025-05-31', 1)).toBe('2025-06-30');
  });

  it('crosses into the next year', () => {
    expect(addMonths('2025-12-15', 1)).toBe('2026-01-15');
  });

  it('counts back with a negative number of months, clamped too', () => {
    expect(addMonths('2025-11-12', -36)).toBe('2022-11-12');
    expect(addMonths('2024-02-29', -12)).toBe('2023-02-28');
  });
});

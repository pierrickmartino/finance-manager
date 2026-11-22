import { describe, expect, it } from 'vitest';
import { addDays, dateParts, daysBetween, monthIndex, monthStart, yearsEarlier } from './dates';

describe('calendar-day helpers', () => {
  it('moves by calendar days across months and years', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('reads a date into its year, month and day', () => {
    expect(dateParts('2026-08-05')).toEqual({ year: 2026, month: 8, day: 5 });
  });

  it('counts months so that a year back is twelve before', () => {
    expect(monthIndex('2026-01-15') - monthIndex('2025-12-31')).toBe(1);
    expect(monthStart(monthIndex('2026-03-20') - 12)).toBe('2025-03-01');
    expect(monthStart(monthIndex('2026-02-10') - 3)).toBe('2025-11-01');
  });

  it('takes the same date years earlier, 29 February falling back to the 28th', () => {
    expect(yearsEarlier('2026-11-22', 2)).toBe('2024-11-22');
    expect(yearsEarlier('2024-02-29', 1)).toBe('2023-02-28');
    expect(yearsEarlier('2024-02-29', 4)).toBe('2020-02-29');
  });
});

/**
 * Calendar-month arithmetic on ISO dates (`YYYY-MM-DD`), for a Recurring payment's next expected
 * date and the 36-month window. Pure: no clock is read.
 */

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The ISO date `months` calendar months after (or before, when negative) `iso`, clamped to the
 * end of the target month: 31 January plus one month is 28 (or 29) February.
 */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const target = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(target / 12);
  const targetMonth = target - targetYear * 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
}

import { describe, expect, test } from 'vitest';
import { NUMBER_FORMATS } from '@/lib/format';
import { dateFormatChoices, numberFormatChoices } from './view';

describe('numberFormatChoices', () => {
  test('offers every number format, each written as its own example with a convention name', () => {
    expect(numberFormatChoices()).toEqual([
      { value: 'apostrophe', label: "1'234.50", hint: 'Swiss' },
      { value: 'comma', label: '1,234.50', hint: 'English' },
      { value: 'dot', label: '1.234,50', hint: 'German' },
      // The French group separator is a non-breaking space.
      { value: 'space', label: `1${NUMBER_FORMATS.space.group}234,50`, hint: 'French' },
    ]);
  });
});

describe('dateFormatChoices', () => {
  test('offers every date format, each written as the sample date in that format', () => {
    expect(dateFormatChoices()).toEqual([
      { value: 'dd.mm.yyyy', label: '31.12.2025', hint: 'Day first, dots' },
      { value: 'dd/mm/yyyy', label: '31/12/2025', hint: 'Day first, slashes' },
      { value: 'yyyy-mm-dd', label: '2025-12-31', hint: 'ISO 8601' },
      { value: 'mm/dd/yyyy', label: '12/31/2025', hint: 'Month first' },
    ]);
  });
});

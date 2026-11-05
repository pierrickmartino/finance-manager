'use client';

/**
 * PROTOTYPE ONLY. In-memory stand-in for the real save action: the question is what the page
 * should look like, not whether the backend works. Nothing here persists.
 */
import { useMemo, useState } from 'react';
import {
  createFormatter,
  DATE_FORMATS,
  NUMBER_FORMATS,
  type DateFormat,
  type DisplaySettings,
  type NumberFormat,
} from '@/lib/format';

export const NUMBER_FORMAT_KEYS = Object.keys(NUMBER_FORMATS) as NumberFormat[];
export { DATE_FORMATS };

export const NUMBER_FORMAT_NAMES: Record<NumberFormat, string> = {
  apostrophe: 'Swiss',
  comma: 'English',
  dot: 'German',
  space: 'French',
};

export const DATE_FORMAT_NAMES: Record<DateFormat, string> = {
  'dd.mm.yyyy': 'Day first, dots',
  'dd/mm/yyyy': 'Day first, slashes',
  'yyyy-mm-dd': 'ISO 8601',
  'mm/dd/yyyy': 'US, month first',
};

/** Realistic rows so the preview looks like the app, not a test card. */
export const SAMPLE_ROWS = [
  { date: '2025-12-31', payee: 'Migros', category: 'Groceries', minor: -8_745, currency: 'CHF' },
  { date: '2025-12-28', payee: 'Employer AG', category: 'Salary', minor: 812_550, currency: 'CHF' },
  { date: '2025-12-24', payee: 'SBB', category: 'Transport', minor: -12_800, currency: 'CHF' },
  { date: '2025-12-20', payee: 'Amazon.de', category: 'Shopping', minor: -4_399, currency: 'EUR' },
  { date: '2025-12-01', payee: 'Landlord', category: 'Rent', minor: -245_000, currency: 'CHF' },
];
export const SAMPLE_BALANCE_MINOR = 12_345_678_90;
export const SAMPLE_DATE = '2025-12-31';

export function useDraftSettings(saved: DisplaySettings) {
  const [committed, setCommitted] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const fmt = useMemo(() => createFormatter(draft), [draft]);
  const isDirty =
    draft.numberFormat !== committed.numberFormat || draft.dateFormat !== committed.dateFormat;

  function update(patch: Partial<DisplaySettings>) {
    setDraft((previous) => ({ ...previous, ...patch }));
  }

  function save(next: DisplaySettings = draft) {
    setCommitted(next);
    setDraft(next);
    setSavedAt(Date.now());
  }

  return {
    draft,
    committed,
    fmt,
    isDirty,
    savedAt,
    update,
    save,
    reset: () => setDraft(committed),
  };
}

/** Formats a value with any settings, for options that show "what you'd get". */
export function formatWith(settings: DisplaySettings) {
  return createFormatter(settings);
}

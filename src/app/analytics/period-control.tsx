'use client';

import Form from 'next/form';
import { useId, type ChangeEvent } from 'react';
import { FIELD_LABEL_CLASS } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import {
  PERIOD_PRESETS,
  cardPeriodsToParams,
  presetLabels,
  type CardPeriods,
  type PeriodPreset,
} from '@/lib/analytics/period';
import { HiddenFields } from './hidden-fields';

interface PeriodControlProps {
  /** The page's Period preset: the dropdown shows it. */
  preset: PeriodPreset;
  /** The Period in words: "Last 90 days · 25 Aug – 22 Nov 2026". */
  phrase: string;
  /** Today, which names the presets ("Since 2025"). */
  today: string;
  /** The Cards' pins, sent again as they are: changing the page's Period keeps every one. */
  cardPeriods: CardPeriods;
}

/**
 * Analytics' Period control (GLOSSARY: Period, ADR-0016, ADR-0021): a GET form of one dropdown of
 * the Period presets, beside the Period in words. Picking a preset reads Analytics over it at once,
 * as a Card's Period does. The Cards' pins ride along in hidden fields, so a pinned Card keeps its
 * own Period (GLOSSARY: Card Period). It sticks to the top of the screen as the page scrolls, so
 * the Period can change from anywhere.
 */
export function PeriodControl({ preset, phrase, today, cardPeriods }: PeriodControlProps) {
  const id = useId();
  const labels = presetLabels(today);
  const onChange = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();

  return (
    <Form
      action="/analytics"
      scroll={false}
      aria-label="Period"
      data-testid="period-control"
      className="sticky top-0 z-10 -mx-1 flex flex-wrap items-end gap-x-3 gap-y-2 glass-paper px-1 py-2"
    >
      {/* The field primitive's layout, but the label set beside its control (htmlFor) rather
          than wrapping it: a wrapping label would fold the chosen option into the select's
          accessible name ("Period Last 12 months"). */}
      <div className={FIELD_LABEL_CLASS}>
        <label htmlFor={`${id}-period`}>Period</label>
        <select
          id={`${id}-period`}
          name="period"
          defaultValue={preset}
          onChange={onChange}
          className={INPUT_CLASS}
        >
          {PERIOD_PRESETS.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </div>
      <HiddenFields params={cardPeriodsToParams(cardPeriods)} />
      <p className="basis-full text-sm text-muted sm:basis-auto sm:pb-1.5" aria-live="polite">
        {phrase}
      </p>
    </Form>
  );
}

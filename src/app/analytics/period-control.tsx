'use client';

import Form from 'next/form';
import { useId, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import { FIELD_LABEL_CLASS } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import { SECONDARY_BUTTON_CLASS } from '@/components/surface';
import {
  isPeriodPreset,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  type Period,
  type PeriodPreset,
} from '@/lib/analytics/period';

interface PeriodControlProps {
  period: Period;
  /** The Period's first day, as read: the date field shows it. */
  from: string;
  /** The Period in words: "Rolling 90 days · 25 Aug – 22 Nov 2026". */
  phrase: string;
  /** Each preset's start date today, so picking one fills in its date at once. */
  starts: Record<PeriodPreset, string>;
  /** Today: the latest start date the field takes. */
  today: string;
}

const noSubscription = () => () => {};

/** Whether the control runs in the browser: false while server-rendering and hydrating. */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** The select's value for a typed start date. */
const CUSTOM = 'custom';

/**
 * Analytics' only control (GLOSSARY: Period, ADR-0016): a GET form of the Period presets (and
 * Custom) and the Period's start date, under the Period in words. Picking a preset fills in its date
 * and reads Analytics over it; typing a date switches the list to Custom, and Show reads
 * Analytics from it. Once hydrated, the form sends only `period` for a preset or only `from` for
 * Custom; without JavaScript it sends both, and the chosen preset wins unless Custom is
 * selected. It sticks to the top of the screen as the page scrolls, so the Period can change from
 * anywhere.
 */
export function PeriodControl({ period, from, phrase, starts, today }: PeriodControlProps) {
  const id = useId();
  const [choice, setChoice] = useState<string>(period.kind === 'preset' ? period.preset : CUSTOM);
  const [start, setStart] = useState(from);
  const isHydrated = useIsHydrated();
  const isCustom = choice === CUSTOM;
  const onPreset = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value, form } = event.currentTarget;
    if (!isPeriodPreset(value)) {
      setChoice(value);
      return;
    }
    // Rendered before submitting, so the form names the preset's field, not the date's.
    flushSync(() => {
      setChoice(value);
      setStart(starts[value]);
    });
    form?.requestSubmit();
  };
  const onDate = (event: ChangeEvent<HTMLInputElement>) => {
    setStart(event.currentTarget.value);
    setChoice(CUSTOM);
  };

  return (
    <Form
      action="/analytics"
      scroll={false}
      aria-label="Period"
      data-testid="period-control"
      className="sticky top-0 z-10 -mx-1 flex flex-wrap items-end gap-x-3 gap-y-2 glass-paper px-1 py-2"
    >
      {/* The field primitive's layout, but each label set beside its control (htmlFor) rather
          than wrapping it: a wrapping label would fold the chosen option into the select's
          accessible name ("Period Rolling 12 months"). */}
      <div className={FIELD_LABEL_CLASS}>
        <label htmlFor={`${id}-period`}>Period</label>
        <select
          id={`${id}-period`}
          name={isHydrated && isCustom ? undefined : 'period'}
          value={choice}
          onChange={onPreset}
          className={INPUT_CLASS}
        >
          {PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {PERIOD_PRESET_LABELS[preset]}
            </option>
          ))}
          <option value={CUSTOM}>Custom</option>
        </select>
      </div>
      <div className={FIELD_LABEL_CLASS}>
        <label htmlFor={`${id}-from`}>From</label>
        <input
          id={`${id}-from`}
          type="date"
          name={isHydrated && !isCustom ? undefined : 'from'}
          value={start}
          max={today}
          required
          onChange={onDate}
          className={INPUT_CLASS}
        />
      </div>
      <button type="submit" className={SECONDARY_BUTTON_CLASS}>
        Show
      </button>
      <p className="basis-full text-sm text-muted sm:basis-auto sm:self-center" aria-live="polite">
        {phrase}
      </p>
    </Form>
  );
}

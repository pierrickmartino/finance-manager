'use client';

import Form from 'next/form';
import { useId, useState, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_PERIOD_MARK_CLASS } from '@/components/surface';
import {
  isPeriodPreset,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  periodToParams,
  withCardPeriod,
  type AnalyticsPage,
  type PeriodPreset,
  type PinnableSection,
} from '@/lib/analytics/period';
import { HiddenFields } from './hidden-fields';

interface CardPeriodProps {
  /** The Card's name, which names its dropdown: "Period for Spending by Category". */
  name: string;
  section: PinnableSection;
  /** The page the Card sits on: its Period and every Card's pin, all kept on a pick. */
  page: AnalyticsPage;
  /** The preset the Card is pinned to; null when it follows the page's Period. */
  pinned: PeriodPreset | null;
}

/** The dropdown's option for following the page's Period: the `null` choice. */
const SAME_AS_PAGE = '';

/**
 * A pinnable Card's Period (GLOSSARY: Card Period, ADR-0018): its preset marked in the accent
 * when pinned, and a dropdown of the Period presets plus "Same as page". Picking reads Analytics
 * again with this Card's parameter set, or removed for "Same as page", keeping the page's Period
 * and every other pin: a GET form of hidden fields, as the Period control is.
 */
export function CardPeriod({ name, section, page, pinned }: CardPeriodProps) {
  const id = useId();
  const [choice, setChoice] = useState<PeriodPreset | null>(pinned);
  const pageWithoutThisPin = periodToParams({
    period: page.period,
    cardPeriods: withCardPeriod(page.cardPeriods, section, null),
  });
  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value, form } = event.currentTarget;
    // Rendered before submitting, so "Same as page" sends no parameter for this Card.
    flushSync(() => setChoice(isPeriodPreset(value) ? value : null));
    form?.requestSubmit();
  };

  return (
    <Form
      action="/analytics"
      scroll={false}
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="card-period"
    >
      {pinned && (
        <span className={CARD_PERIOD_MARK_CLASS} data-testid="card-period-mark">
          <span className="sr-only">Pinned to </span>
          {PERIOD_PRESET_LABELS[pinned]}
        </span>
      )}
      <HiddenFields params={pageWithoutThisPin} />
      <label htmlFor={`${id}-period`} className="sr-only">
        Period for {name}
      </label>
      <select
        id={`${id}-period`}
        name={choice === null ? undefined : section}
        value={choice ?? SAME_AS_PAGE}
        onChange={onChange}
        className={`${INPUT_CLASS} max-w-full text-xs`}
      >
        <option value={SAME_AS_PAGE}>Same as page</option>
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {PERIOD_PRESET_LABELS[preset]}
          </option>
        ))}
      </select>
    </Form>
  );
}

'use client';

import Form from 'next/form';
import { useId, useState, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import { CARD_PERIOD_PICKER_CLASS } from '@/components/surface';
import {
  isPeriodPreset,
  PERIOD_PRESETS,
  periodLabel,
  periodToParams,
  presetLabels,
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
  /** Today, which names the presets ("Since 2025"). */
  today: string;
}

/** The dropdown's option for following the page's Period: the `null` choice. */
const SAME_AS_PAGE = '';

/**
 * A pinnable Card's Period (GLOSSARY: Card Period, ADR-0018): one chip naming what the Card reads,
 * its preset in the accent when pinned (the mark) or "Same as page" when it follows, with the
 * dropdown of "Same as page (the page's Period)" and the Period presets laid invisibly over it, so
 * the name shows once. Picking reads Analytics again with this Card's parameter set, or removed
 * for "Same as page", keeping the page's Period and every other pin: a GET form of hidden fields,
 * as the Period control is.
 */
export function CardPeriod({ name, section, page, pinned, today }: CardPeriodProps) {
  const id = useId();
  const [choice, setChoice] = useState<PeriodPreset | null>(pinned);
  const labels = presetLabels(today);
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
      className="flex min-w-0 items-center"
      data-testid="card-period"
    >
      <HiddenFields params={pageWithoutThisPin} />
      <div className={CARD_PERIOD_PICKER_CLASS[choice ? 'pinned' : 'following']}>
        {choice ? (
          <span className="truncate" data-testid="card-period-mark">
            <span className="sr-only">Pinned to </span>
            {labels[choice]}
          </span>
        ) : (
          <span className="truncate" aria-hidden="true">
            Same as page
          </span>
        )}
        <span aria-hidden="true">▾</span>
        <label htmlFor={`${id}-period`} className="sr-only">
          Period for {name}
        </label>
        <select
          id={`${id}-period`}
          name={choice === null ? undefined : section}
          value={choice ?? SAME_AS_PAGE}
          onChange={onChange}
          className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
        >
          <option value={SAME_AS_PAGE}>Same as page ({periodLabel(page.period, today)})</option>
          {PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {labels[preset]}
            </option>
          ))}
        </select>
      </div>
    </Form>
  );
}

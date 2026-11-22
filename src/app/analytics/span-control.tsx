'use client';

import Form from 'next/form';
import { useId, useState, type ChangeEvent } from 'react';
import { INPUT_CLASS } from '@/components/named-list';
import { SECONDARY_BUTTON_CLASS } from '@/components/surface';
import {
  isSpanPreset,
  SPAN_PRESET_LABELS,
  SPAN_PRESETS,
  type Span,
  type SpanPreset,
} from '@/lib/analytics/span';

/** A field: its label above its control. */
const FIELD_CLASS = 'flex flex-col gap-1 text-sm font-medium';

interface SpanControlProps {
  span: Span;
  /** The Span's first day, as read: the date field shows it. */
  from: string;
  /** The Span in words: "Rolling 90 days · 25 Aug – 22 Nov 2026". */
  phrase: string;
  /** Each preset's start date today, so picking one fills in its date at once. */
  starts: Record<SpanPreset, string>;
}

/**
 * Analytics' only control (GLOSSARY: Span, ADR-0016): a GET form of the Span presets and the
 * start date the chosen one gives, read-only, under the Span in words. Picking a preset fills
 * in its date and reads Analytics over it; without JavaScript, Show submits the form as is. It
 * sticks to the top of the screen as the page scrolls, so the Span can change from anywhere.
 */
export function SpanControl({ span, from, phrase, starts }: SpanControlProps) {
  const id = useId();
  const [start, setStart] = useState(from);
  const onPreset = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value, form } = event.currentTarget;
    if (isSpanPreset(value)) setStart(starts[value]);
    form?.requestSubmit();
  };

  return (
    <Form
      action="/analytics"
      scroll={false}
      aria-label="Span"
      data-testid="span-control"
      className="sticky top-0 z-10 -mx-1 flex flex-wrap items-end gap-x-3 gap-y-2 bg-paper px-1 py-2"
    >
      <div className={FIELD_CLASS}>
        <label htmlFor={`${id}-span`}>Span</label>
        <select
          id={`${id}-span`}
          name="span"
          defaultValue={span.kind === 'preset' ? span.preset : undefined}
          onChange={onPreset}
          className={INPUT_CLASS}
        >
          {SPAN_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {SPAN_PRESET_LABELS[preset]}
            </option>
          ))}
        </select>
      </div>
      <div className={FIELD_CLASS}>
        <label htmlFor={`${id}-from`}>From</label>
        <input
          id={`${id}-from`}
          type="date"
          value={start}
          readOnly
          className={`${INPUT_CLASS} text-ink-soft`}
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

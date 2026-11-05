'use client';

/**
 * PROTOTYPE Variant D, "Sentence": the whole page is one sentence with two inline pickers,
 * and a big example below that updates as you type. Minimal and conversational, closest to
 * the page's real size (two settings), with nothing to scale.
 */
import type { DisplaySettings } from '@/lib/format';
import { NUMBER_FORMATS } from '@/lib/format';
import { PRIMARY_BUTTON_CLASS } from '@/components/surface';
import {
  DATE_FORMATS,
  NUMBER_FORMAT_KEYS,
  SAMPLE_DATE,
  formatWith,
  useDraftSettings,
} from './use-draft-settings';

export const VARIANT_D_NAME = 'Sentence';

const INLINE_SELECT =
  'mx-1 cursor-pointer appearance-none rounded-md border-b-2 border-dashed border-indigo-500 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 tabular-nums dark:bg-indigo-950/50 dark:text-indigo-300';

export function VariantD({ settings }: { settings: DisplaySettings }) {
  const { draft, fmt, isDirty, savedAt, update, save } = useDraftSettings(settings);

  return (
    <section className="flex min-h-[60vh] flex-col justify-center gap-10 pb-24">
      <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">Settings</p>
      <p className="max-w-3xl text-2xl leading-relaxed md:text-3xl md:leading-relaxed">
        Write amounts like
        <select
          aria-label="Number format"
          value={draft.numberFormat}
          onChange={(event) =>
            update({ numberFormat: event.target.value as typeof draft.numberFormat })
          }
          className={INLINE_SELECT}
        >
          {NUMBER_FORMAT_KEYS.map((key) => (
            <option key={key} value={key}>
              {NUMBER_FORMATS[key].example}
            </option>
          ))}
        </select>
        and dates like
        <select
          aria-label="Date format"
          value={draft.dateFormat}
          onChange={(event) =>
            update({ dateFormat: event.target.value as typeof draft.dateFormat })
          }
          className={INLINE_SELECT}
        >
          {DATE_FORMATS.map((key) => (
            <option key={key} value={key}>
              {formatWith({ ...draft, dateFormat: key }).date(SAMPLE_DATE)}
            </option>
          ))}
        </select>
        .
      </p>

      <div
        aria-label="Preview"
        className="flex max-w-3xl flex-col gap-1 border-l-4 border-zinc-200 pl-6 dark:border-zinc-800"
      >
        <p className="text-sm text-zinc-500">So on New Year’s Eve your rent shows as</p>
        <p className="text-4xl font-semibold tracking-tight tabular-nums">
          {fmt.amount(-245_000, { currency: 'CHF' })}
        </p>
        <p className="text-zinc-500">
          paid {fmt.date(SAMPLE_DATE)}, from a balance of{' '}
          {fmt.amount(1_234_567_890, { currency: 'CHF' })}.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!isDirty}
          onClick={() => save()}
          className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-40`}
        >
          Save
        </button>
        {!isDirty && savedAt && (
          <span className="text-sm text-emerald-600">Saved (prototype stub).</span>
        )}
        <span className="text-sm text-zinc-400">Labels stay in English.</span>
      </div>
    </section>
  );
}

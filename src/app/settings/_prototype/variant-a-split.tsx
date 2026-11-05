'use client';

/**
 * PROTOTYPE Variant A, "Live split": radio lists on the left, a sticky live preview on the
 * right that renders a slice of a real-looking transactions table with the *pending* choice.
 * Explicit save via a bar that only appears when something changed.
 */
import { CARD_CLASS, GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { DisplaySettings } from '@/lib/format';
import {
  DATE_FORMAT_NAMES,
  DATE_FORMATS,
  NUMBER_FORMAT_KEYS,
  NUMBER_FORMAT_NAMES,
  SAMPLE_ROWS,
  SAMPLE_BALANCE_MINOR,
  formatWith,
  useDraftSettings,
} from './use-draft-settings';
import { NUMBER_FORMATS } from '@/lib/format';

export const VARIANT_A_NAME = 'Live split';

function RadioRow({
  name,
  value,
  checked,
  title,
  hint,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  title: string;
  hint: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-2.5 text-sm ${
        checked
          ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
          : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800'
      }`}
    >
      <span className="flex items-center gap-3">
        <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
        <span className="font-medium tabular-nums">{title}</span>
      </span>
      <span className="text-zinc-500">{hint}</span>
    </label>
  );
}

export function VariantA({ settings }: { settings: DisplaySettings }) {
  const { draft, fmt, isDirty, savedAt, update, save, reset } = useDraftSettings(settings);

  return (
    <section className="flex flex-col gap-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500">
          How amounts and dates are written on every screen. Labels stay in English.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold tracking-wide text-zinc-500 uppercase">
              Number format
            </legend>
            {NUMBER_FORMAT_KEYS.map((key) => (
              <RadioRow
                key={key}
                name="numberFormat"
                value={key}
                checked={draft.numberFormat === key}
                title={NUMBER_FORMATS[key].example}
                hint={NUMBER_FORMAT_NAMES[key]}
                onChange={() => update({ numberFormat: key })}
              />
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold tracking-wide text-zinc-500 uppercase">
              Date format
            </legend>
            {DATE_FORMATS.map((key) => (
              <RadioRow
                key={key}
                name="dateFormat"
                value={key}
                checked={draft.dateFormat === key}
                title={formatWith({ ...draft, dateFormat: key }).date('2025-12-31')}
                hint={DATE_FORMAT_NAMES[key]}
                onChange={() => update({ dateFormat: key })}
              />
            ))}
          </fieldset>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className={`${CARD_CLASS} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-medium">Preview</p>
              <span className="text-xs text-zinc-500">
                {isDirty ? 'Unsaved changes' : 'As you see it now'}
              </span>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-zinc-500">Total balance</p>
              <p className="text-2xl font-semibold tabular-nums">
                {fmt.amount(SAMPLE_BALANCE_MINOR, { currency: 'CHF' })}
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {SAMPLE_ROWS.map((row) => (
                  <tr key={row.payee} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 text-zinc-500 tabular-nums">{fmt.date(row.date)}</td>
                    <td className="py-2">
                      <p className="font-medium">{row.payee}</p>
                      <p className="text-xs text-zinc-500">{row.category}</p>
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${row.minor > 0 ? 'text-emerald-600' : ''}`}
                    >
                      {fmt.amount(row.minor, { currency: row.currency })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      {isDirty && (
        <div className="sticky bottom-20 z-10 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm">You have unsaved changes.</p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className={GHOST_BUTTON_CLASS}>
              Discard
            </button>
            <button type="button" onClick={() => save()} className={PRIMARY_BUTTON_CLASS}>
              Save
            </button>
          </div>
        </div>
      )}
      {!isDirty && savedAt && <p className="text-sm text-emerald-600">Saved (prototype stub).</p>}
    </section>
  );
}

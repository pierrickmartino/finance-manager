'use client';

/**
 * PROTOTYPE Variant B, "Pick a look": no separate preview and no Save button. Every option
 * IS its own preview (a tile rendering the same sample values in that format). Clicking a
 * tile saves immediately, confirmed by a toast with Undo.
 */
import { useEffect, useState } from 'react';
import type { DisplaySettings } from '@/lib/format';
import {
  DATE_FORMAT_NAMES,
  DATE_FORMATS,
  NUMBER_FORMAT_KEYS,
  NUMBER_FORMAT_NAMES,
  SAMPLE_DATE,
  formatWith,
  useDraftSettings,
} from './use-draft-settings';

export const VARIANT_B_NAME = 'Pick a look (instant save)';

const TOAST_MS = 4000;

function Tile({
  isSelected,
  onClick,
  big,
  caption,
}: {
  isSelected: boolean;
  onClick: () => void;
  big: string;
  caption: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      className={`relative flex flex-col items-start gap-2 rounded-2xl border-2 p-5 text-left transition ${
        isSelected
          ? 'border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
          : 'border-transparent bg-white shadow-sm hover:border-zinc-300 dark:bg-zinc-900 dark:hover:border-zinc-700'
      }`}
    >
      {isSelected && (
        <span className="absolute top-3 right-3 grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs text-white">
          ✓
        </span>
      )}
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{big}</span>
      <span className="text-sm text-zinc-500">{caption}</span>
    </button>
  );
}

export function VariantB({ settings }: { settings: DisplaySettings }) {
  const { committed, save } = useDraftSettings(settings);
  const [undo, setUndo] = useState<DisplaySettings | null>(null);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  function choose(patch: Partial<DisplaySettings>) {
    const next = { ...committed, ...patch };
    if (next.numberFormat === committed.numberFormat && next.dateFormat === committed.dateFormat)
      return;
    setUndo(committed);
    save(next);
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-10 pb-24">
      <header className="text-center">
        <h1 className="text-3xl font-semibold">How should numbers look?</h1>
        <p className="mt-2 text-zinc-500">
          Pick the one that reads naturally to you. It applies everywhere, right away.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-500">Amounts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMBER_FORMAT_KEYS.map((key) => (
            <Tile
              key={key}
              isSelected={committed.numberFormat === key}
              onClick={() => choose({ numberFormat: key })}
              big={formatWith({ ...committed, numberFormat: key }).amount(-123_456_789, {
                currency: 'CHF',
              })}
              caption={NUMBER_FORMAT_NAMES[key]}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-500">Dates</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DATE_FORMATS.map((key) => (
            <Tile
              key={key}
              isSelected={committed.dateFormat === key}
              onClick={() => choose({ dateFormat: key })}
              big={formatWith({ ...committed, dateFormat: key }).date(SAMPLE_DATE)}
              caption={DATE_FORMAT_NAMES[key]}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-zinc-400">Labels stay in English.</p>

      {undo && (
        <div
          role="status"
          className="fixed top-20 right-6 z-40 flex items-center gap-4 rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900"
        >
          Saved (prototype stub)
          <button
            type="button"
            onClick={() => {
              save(undo);
              setUndo(null);
            }}
            className="font-semibold underline"
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

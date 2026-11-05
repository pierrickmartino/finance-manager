'use client';

/**
 * PROTOTYPE Variant C, "Preferences pane": built for a settings page that will grow. A
 * section nav on the left, and a grouped list of rows (label left, current value right) that
 * expand inline into a picker. Only "Display" is live. The other sections are greyed
 * placeholders that show how the structure scales; they are NOT a feature proposal.
 */
import { useState } from 'react';
import { CARD_CLASS } from '@/components/surface';
import { NUMBER_FORMATS, type DisplaySettings } from '@/lib/format';
import {
  DATE_FORMAT_NAMES,
  DATE_FORMATS,
  NUMBER_FORMAT_KEYS,
  NUMBER_FORMAT_NAMES,
  SAMPLE_DATE,
  formatWith,
  useDraftSettings,
} from './use-draft-settings';

export const VARIANT_C_NAME = 'Preferences pane';

const SECTIONS = [
  { id: 'display', label: 'Display', isLive: true },
  { id: 'security', label: 'Security', isLive: false },
  { id: 'data', label: 'Data & export', isLive: false },
] as const;

type RowId = 'number' | 'date';

function Row({
  label,
  value,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-100 first:border-t-0 dark:border-zinc-800">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-2 text-zinc-500 tabular-nums">
          {value}
          <span className={`transition ${isOpen ? 'rotate-90' : ''}`}>›</span>
        </span>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Choices<T extends string>({
  options,
  selected,
  render,
  onPick,
}: {
  options: readonly T[];
  selected: T;
  render: (option: T) => { main: string; sub: string };
  onPick: (option: T) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg bg-zinc-50 dark:divide-zinc-800 dark:bg-zinc-950">
      {options.map((option) => {
        const { main, sub } = render(option);
        return (
          <li key={option}>
            <button
              type="button"
              onClick={() => onPick(option)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm"
            >
              <span className="tabular-nums">{main}</span>
              <span className="flex items-center gap-3 text-zinc-500">
                {sub}
                <span className="w-4 text-indigo-600">{option === selected ? '✓' : ''}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function VariantC({ settings }: { settings: DisplaySettings }) {
  const { committed, fmt, save } = useDraftSettings(settings);
  const [open, setOpen] = useState<RowId | null>(null);
  const [section, setSection] = useState<string>('display');

  function pick(patch: Partial<DisplaySettings>) {
    save({ ...committed, ...patch });
    setOpen(null);
  }

  return (
    <section className="flex flex-col gap-6 pb-24">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav className="flex gap-1 md:flex-col">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.isLive}
              onClick={() => setSection(item.id)}
              className={`rounded-md px-3 py-2 text-left text-sm ${
                section === item.id
                  ? 'bg-zinc-200 font-medium dark:bg-zinc-800'
                  : 'text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300 disabled:hover:bg-transparent dark:text-zinc-400 dark:disabled:text-zinc-700 dark:hover:bg-zinc-800'
              }`}
            >
              {item.label}
              {!item.isLive && <span className="ml-1 text-xs">(placeholder)</span>}
            </button>
          ))}
        </nav>

        <div className="flex max-w-2xl flex-col gap-6">
          <div>
            <h2 className="text-lg font-medium">Display</h2>
            <p className="text-sm text-zinc-500">
              Amounts look like{' '}
              <strong className="text-zinc-900 tabular-nums dark:text-zinc-100">
                {fmt.amount(-123_456_789, { currency: 'CHF' })}
              </strong>{' '}
              and dates like{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">{fmt.date(SAMPLE_DATE)}</strong>.
              Changes save when you pick.
            </p>
          </div>

          <div className={CARD_CLASS}>
            <Row
              label="Number format"
              value={NUMBER_FORMATS[committed.numberFormat].example}
              isOpen={open === 'number'}
              onToggle={() => setOpen(open === 'number' ? null : 'number')}
            >
              <Choices
                options={NUMBER_FORMAT_KEYS}
                selected={committed.numberFormat}
                render={(key) => ({
                  main: NUMBER_FORMATS[key].example,
                  sub: NUMBER_FORMAT_NAMES[key],
                })}
                onPick={(key) => pick({ numberFormat: key })}
              />
            </Row>
            <Row
              label="Date format"
              value={fmt.date(SAMPLE_DATE)}
              isOpen={open === 'date'}
              onToggle={() => setOpen(open === 'date' ? null : 'date')}
            >
              <Choices
                options={DATE_FORMATS}
                selected={committed.dateFormat}
                render={(key) => ({
                  main: formatWith({ ...committed, dateFormat: key }).date(SAMPLE_DATE),
                  sub: DATE_FORMAT_NAMES[key],
                })}
                onPick={(key) => pick({ dateFormat: key })}
              />
            </Row>
            <Row label="Interface language" value="English" isOpen={false} onToggle={() => {}}>
              {null}
            </Row>
          </div>
          <p className="text-xs text-zinc-400">
            Language is fixed to English (shown read-only for structure).
          </p>
        </div>
      </div>
    </section>
  );
}

'use client';

/**
 * PROTOTYPE: throwaway. A roomier Split editor for the /transactions/[id] layout variants:
 * an allocation bar, and either a spreadsheet grid ("grid") or one card per line ("cards").
 * Saving is stubbed: nothing is written. The real editor is split-form.tsx.
 */

import { useRef, useState, type ReactNode } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { BUTTON_CLASS } from '@/components/named-list';
import { PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { parseAmount } from '@/lib/format/parse-amount';
import type { CategoryGroup } from '@/server/services/categories';
import type { PayeeRef } from '@/server/services/payees';
import { editableAmount, remainingMinor, type SplitLineDraft } from './split-lines';

const INPUT =
  'w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const EMPTY_LINE: SplitLineDraft = { amount: '', categoryId: '', tags: '', note: '' };
const SEGMENT_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
];

interface KeyedLine {
  key: number;
  draft: SplitLineDraft;
}

export interface SplitWorkbenchProps {
  layout: 'grid' | 'cards';
  amountMinor: number;
  currency: string;
  initialLines: SplitLineDraft[];
  groups: CategoryGroup[];
  payees: PayeeRef[];
  transactionPayee: string | null;
  transfers: Record<string, ReactNode>;
  isSplit: boolean;
}

export function SplitWorkbench(props: SplitWorkbenchProps) {
  const { layout, amountMinor, currency, initialLines } = props;
  const fmt = useFormatter();
  const numberFormat = fmt.settings.numberFormat;
  const [lines, setLines] = useState<KeyedLine[]>(() =>
    initialLines.map((draft, index) => ({ key: index, draft })),
  );
  const [saved, setSaved] = useState(false);
  const nextKey = useRef(initialLines.length);
  const remaining = remainingMinor(
    amountMinor,
    lines.map((line) => line.draft.amount),
    numberFormat,
    currency,
  );
  const minorOf = (text: string) =>
    text.trim() === '' ? 0 : (parseAmount(text, numberFormat, currency) ?? 0);

  const update = (key: number, change: Partial<SplitLineDraft>) => {
    setSaved(false);
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { key, draft: { ...line.draft, ...change } } : line,
      ),
    );
  };
  const remove = (key: number) => setLines((current) => current.filter((line) => line.key !== key));
  const add = () => {
    const key = nextKey.current;
    nextKey.current += 1;
    const amount =
      remaining !== null && remaining !== 0
        ? editableAmount(remaining, numberFormat, currency)
        : '';
    setLines((current) => [...current, { key, draft: { ...EMPTY_LINE, amount } }]);
  };
  const takeRest = (line: KeyedLine) => {
    if (remaining === null || remaining === 0) return;
    const minor = minorOf(line.draft.amount) + remaining;
    update(line.key, { amount: editableAmount(minor, numberFormat, currency) });
  };

  const rowProps = (line: KeyedLine, index: number): LineProps => ({
    ...props,
    line: line.draft,
    number: index + 1,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length] ?? 'bg-sky-500',
    transfer: line.draft.isTransfer && (props.transfers[line.draft.id ?? ''] ?? 'Transfer'),
    onChange: (change) => update(line.key, change),
    onRemove: lines.length > 1 && !line.draft.isTransfer ? () => remove(line.key) : undefined,
    onTakeRest: remaining ? () => takeRest(line) : undefined,
  });

  return (
    <form
      aria-label="Split (prototype)"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
      className="flex flex-col gap-4"
    >
      <AllocationBar
        totalMinor={amountMinor}
        parts={lines.map((line) => minorOf(line.draft.amount))}
        remaining={remaining}
        format={(minor) => fmt.amount(minor, { currency })}
      />
      {layout === 'grid' ? (
        <div className="overflow-x-auto">
          <div role="table" aria-label="Split lines" className="min-w-[56rem] text-sm">
            <div
              role="row"
              className={`${GRID_COLUMNS} border-b border-zinc-200 pb-1.5 text-xs text-zinc-500 dark:border-zinc-800`}
            >
              <span />
              <span>Category / Transfer</span>
              <span>Payee</span>
              <span>Tags</span>
              <span>Note</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {lines.map((line, index) => (
              <GridRow key={line.key} {...rowProps(line, index)} />
            ))}
          </div>
        </div>
      ) : (
        <ol className="grid gap-3 xl:grid-cols-2">
          {lines.map((line, index) => (
            <LineCard key={line.key} {...rowProps(line, index)} />
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={BUTTON_CLASS} onClick={add}>
          + Add line
        </button>
        <span className="text-zinc-500">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
        <span className="ml-auto" />
        <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={remaining !== 0}>
          {props.isSplit ? 'Save Split' : 'Split Transaction'}
        </button>
        {saved && <span className="text-fuchsia-600">Prototype: not saved.</span>}
      </div>
    </form>
  );
}

interface AllocationBarProps {
  totalMinor: number;
  parts: number[];
  remaining: number | null;
  format: (minor: number) => string;
}

/** How much of the amount each line takes, and what is left (or over-allocated). */
function AllocationBar({ totalMinor, parts, remaining, format }: AllocationBarProps) {
  const total = Math.abs(totalMinor) || 1;
  const allocated = parts.reduce((sum, minor) => sum + minor, 0);
  const isOver =
    remaining !== null &&
    Math.sign(remaining) !== 0 &&
    Math.sign(remaining) !== Math.sign(totalMinor);
  const scale = Math.max(total, Math.abs(allocated));
  const status =
    remaining === null
      ? 'An amount is not valid'
      : remaining === 0
        ? 'Fully allocated'
        : isOver
          ? `Over by ${format(-remaining)}`
          : `${format(remaining)} left to allocate`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="tabular-nums">
          {format(allocated)} <span className="text-zinc-500">of {format(totalMinor)}</span>
        </span>
        <span
          aria-live="polite"
          data-testid="split-remaining"
          className={
            remaining === 0
              ? 'font-medium text-emerald-600'
              : isOver || remaining === null
                ? 'font-medium text-rose-600'
                : 'font-medium text-amber-600'
          }
        >
          {status}
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {parts.map((minor, index) => (
          <div
            key={index}
            title={`Line ${index + 1}: ${format(minor)}`}
            className={`${SEGMENT_COLORS[index % SEGMENT_COLORS.length]} border-r border-white last:border-r-0 dark:border-zinc-900`}
            style={{ width: `${(Math.abs(minor) / scale) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const GRID_COLUMNS =
  'grid grid-cols-[1.75rem_minmax(12rem,1.4fr)_minmax(9rem,1fr)_minmax(8rem,1fr)_minmax(10rem,1.4fr)_8.5rem_5rem] items-center gap-2';

interface LineProps extends Pick<SplitWorkbenchProps, 'groups' | 'payees' | 'transactionPayee'> {
  line: SplitLineDraft;
  number: number;
  color: string;
  transfer: ReactNode;
  onChange: (change: Partial<SplitLineDraft>) => void;
  onRemove?: () => void;
  onTakeRest?: () => void;
}

/** One line as a spreadsheet row: every field in one horizontal pass. */
function GridRow(props: LineProps) {
  const { line, number, color, transfer, onChange, onRemove, onTakeRest } = props;
  return (
    <div
      role="row"
      className={`${GRID_COLUMNS} border-b border-zinc-100 py-1.5 dark:border-zinc-800/60`}
    >
      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {number}
      </span>
      {transfer ? (
        <span className="col-span-2 text-sky-700 dark:text-sky-400">{transfer}</span>
      ) : (
        <>
          <CategorySelect {...props} />
          <PayeeSelect {...props} />
        </>
      )}
      <input
        aria-label={`Tags of line ${number}`}
        value={line.tags}
        onChange={(event) => onChange({ tags: event.target.value })}
        placeholder="Tags"
        className={INPUT}
      />
      <input
        aria-label={`Note of line ${number}`}
        value={line.note}
        onChange={(event) => onChange({ note: event.target.value })}
        placeholder="Note"
        className={INPUT}
      />
      <input
        aria-label={`Amount of line ${number}`}
        value={line.amount}
        onChange={(event) => onChange({ amount: event.target.value })}
        inputMode="decimal"
        className={`${INPUT} text-right tabular-nums`}
      />
      <span className="flex justify-end gap-1">
        {onTakeRest && (
          <button
            type="button"
            title="Add what is left to this line"
            onClick={onTakeRest}
            className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            =rest
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove line ${number}`}
            onClick={onRemove}
            className="rounded px-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

/** One line as a card: amount first and large, then the classification fields in two columns. */
function LineCard(props: LineProps) {
  const { line, number, color, transfer, onChange, onRemove, onTakeRest } = props;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`h-8 w-1.5 rounded-full ${color}`} />
        <span className="text-sm font-medium text-zinc-500">Line {number}</span>
        <input
          aria-label={`Amount of line ${number}`}
          value={line.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          inputMode="decimal"
          className={`${INPUT} ml-auto max-w-40 text-right text-lg font-semibold tabular-nums`}
        />
      </div>
      {transfer ? (
        <p className="text-sm text-sky-700 dark:text-sky-400">{transfer}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Labelled label="Category">
            <CategorySelect {...props} />
          </Labelled>
          <Labelled label="Payee">
            <PayeeSelect {...props} />
          </Labelled>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Labelled label="Tags">
          <input
            aria-label={`Tags of line ${number}`}
            value={line.tags}
            onChange={(event) => onChange({ tags: event.target.value })}
            placeholder="Renovation"
            className={INPUT}
          />
        </Labelled>
        <Labelled label="Note">
          <input
            aria-label={`Note of line ${number}`}
            value={line.note}
            onChange={(event) => onChange({ note: event.target.value })}
            className={INPUT}
          />
        </Labelled>
      </div>
      {(onTakeRest || onRemove) && (
        <div className="flex justify-end gap-2">
          {onTakeRest && (
            <button type="button" onClick={onTakeRest} className={BUTTON_CLASS}>
              Take what is left
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove line ${number}`}
              onClick={onRemove}
              className={BUTTON_CLASS}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function CategorySelect({ line, number, groups, onChange }: LineProps) {
  return (
    <select
      aria-label={`Category of line ${number}`}
      value={line.categoryId}
      onChange={(event) => onChange({ categoryId: event.target.value })}
      className={`${INPUT} ${line.categoryId === '' ? 'text-zinc-500' : ''}`}
    >
      <option value="">Choose a Category</option>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function PayeeSelect({ line, number, payees, transactionPayee, onChange }: LineProps) {
  const payeeId = line.payeeId ?? '';
  return (
    <select
      aria-label={`Payee of line ${number}`}
      value={payeeId}
      onChange={(event) => onChange({ payeeId: event.target.value })}
      className={`${INPUT} ${payeeId === '' ? 'text-zinc-500' : ''}`}
    >
      <option value="">{transactionPayee ?? 'No Payee'}</option>
      {payees.map((payee) => (
        <option key={payee.id} value={payee.id}>
          {payee.name}
        </option>
      ))}
    </select>
  );
}

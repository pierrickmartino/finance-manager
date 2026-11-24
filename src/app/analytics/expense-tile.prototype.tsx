/**
 * PROTOTYPE — throwaway. Three variants of Analytics' Expense key-figure tile, switchable via
 * `?variant=` on the existing `/analytics` route (the floating bar at the bottom cycles them).
 * Question: what should the Expense KPI tile show, and what should lead?
 * Each variant reads only the tile's own KeyFigure (and Income's, for C); nothing else changes.
 */

import Link from 'next/link';
import { TILE_AMOUNT_CLASS, TILE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { KeyFigure } from '@/server/services/analytics';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { ChangeLine } from './key-figure-change';
import { UnconvertedNote } from './section';

export const EXPENSE_VARIANTS = [
  { key: 'current', name: 'Today’s tile' },
  { key: 'A', name: 'Interval bars' },
  { key: 'B', name: 'Versus comparison' },
  { key: 'C', name: 'Share of income' },
] as const;

export type ExpenseVariantKey = (typeof EXPENSE_VARIANTS)[number]['key'];

export function expenseVariantOf(raw: string | string[] | undefined): ExpenseVariantKey {
  const key = Array.isArray(raw) ? raw[0] : raw;
  return EXPENSE_VARIANTS.find((variant) => variant.key === key)?.key ?? 'current';
}

const FIGURE_CLASS = `${TILE_CLASS} flex min-w-0 flex-col gap-1`;

interface VariantProps {
  expense: KeyFigure;
  income: KeyFigure | undefined;
  fmt: Formatter;
}

const chf = (fmt: Formatter, value: number) =>
  fmt.amount(Math.round(value), { currency: BASE_CURRENCY, isWhole: true });

/**
 * A — Interval bars. Expense is a flow, so its trend is drawn as one bar per interval rather
 * than a line; the tallest is called out, the running one hatched. The average per interval
 * sits under the total, so the number has a scale.
 */
export function ExpenseVariantA({ expense, fmt }: VariantProps) {
  const points = expense.sparkline;
  const max = Math.max(1, ...points.map((point) => point.value));
  const settled = points.filter((point) => !point.isPartial);
  const average =
    settled.length > 0 ? settled.reduce((sum, point) => sum + point.value, 0) / settled.length : 0;
  const peak = points.reduce<(typeof points)[number] | null>(
    (best, point) => (best === null || point.value > best.value ? point : best),
    null,
  );
  return (
    <section aria-label={expense.label} className={FIGURE_CLASS}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="font-medium">{expense.label}</h3>
        <p className="text-sm text-muted">{expense.caption}</p>
      </div>
      <Link href={expense.href} className={`${TILE_AMOUNT_CLASS} mt-1 hover:underline`}>
        {chf(fmt, expense.value)}
      </Link>
      <p className="text-sm text-muted tabular-nums">
        ~{chf(fmt, average)} per interval
        {peak && (
          <>
            {' · '}peak <span className="text-ink-soft">{peak.label}</span>
          </>
        )}
      </p>
      <div aria-hidden className="mt-auto flex h-16 items-end gap-1 pt-3">
        {points.map((point) => {
          const height = `${Math.max(4, (Math.max(0, point.value) / max) * 100)}%`;
          const isPeak = point === peak;
          return (
            <div
              key={point.label}
              title={`${point.label}: ${chf(fmt, point.value)}`}
              style={{ height }}
              className={`min-w-0 flex-1 rounded-t-sm ${
                point.isPartial
                  ? 'bg-hatch ring-1 ring-ramp-1/60 ring-inset'
                  : isPeak
                    ? 'bg-ramp-4'
                    : 'bg-ramp-2/55'
              }`}
            />
          );
        })}
      </div>
      {expense.change && (
        <div className="pt-1">
          <ChangeLine change={expense.change} fmt={fmt} />
        </div>
      )}
      {expense.unconverted.count > 0 && <UnconvertedNote {...expense.unconverted} />}
    </section>
  );
}

/**
 * B — Versus comparison. The change leads: a big signed percentage in its tone, then the two
 * stretches side by side as horizontal bars on one scale, this Period above the one before.
 * No sparkline: the question the tile answers is "more or less than before?".
 */
export function ExpenseVariantB({ expense, fmt }: VariantProps) {
  const { change } = expense;
  const previous = change ? expense.value - change.amount : null;
  const scale = Math.max(1, expense.value, previous ?? 0);
  const tone =
    change?.isGood === null || !change
      ? 'text-muted'
      : change.isGood
        ? 'text-positive'
        : 'text-negative';
  const headline = change
    ? change.percent === null
      ? `${change.amount >= 0 ? '+' : '−'}${chf(fmt, Math.abs(change.amount))}`
      : `${change.amount >= 0 ? '+' : '−'}${fmt.percent(Math.abs(change.percent))}`
    : '—';
  const bar = (value: number, className: string) => (
    <div className="h-2.5 w-full rounded-full bg-sunken">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${Math.max(2, (Math.max(0, value) / scale) * 100)}%` }}
      />
    </div>
  );
  return (
    <section aria-label={expense.label} className={FIGURE_CLASS}>
      <h3 className="font-medium">{expense.label}</h3>
      <p className={`${TILE_AMOUNT_CLASS} mt-1 ${tone}`}>
        {change && (
          <span aria-hidden className="mr-1">
            {change.amount > 0 ? '↗' : change.amount < 0 ? '↘' : '→'}
          </span>
        )}
        {headline}
      </p>
      <p className="text-sm text-muted">{change ? change.label : 'Nothing to compare with yet'}</p>
      <dl className="mt-auto flex flex-col gap-2 pt-3 text-sm tabular-nums">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">{expense.caption}</dt>
            <dd>
              <Link href={expense.href} className="font-medium hover:underline">
                {chf(fmt, expense.value)}
              </Link>
            </dd>
          </div>
          {bar(expense.value, 'bg-ramp-1')}
        </div>
        {previous !== null && change && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Before</dt>
              <dd>
                <Link href={change.href} className="text-muted hover:underline">
                  {chf(fmt, previous)}
                </Link>
              </dd>
            </div>
            {bar(previous, 'bg-ramp-5/70')}
          </div>
        )}
      </dl>
      {expense.unconverted.count > 0 && <UnconvertedNote {...expense.unconverted} />}
    </section>
  );
}

/**
 * C — Share of income. Expense read against what came in: a ring of the share spent, the
 * sentence saying it, and what was kept. The amount moves to a quiet second line.
 */
export function ExpenseVariantC({ expense, income, fmt }: VariantProps) {
  const incomeValue = income?.value ?? 0;
  const share = incomeValue > 0 ? expense.value / incomeValue : null;
  const kept = incomeValue - expense.value;
  const radius = 15.9155; // circumference 100
  const filled = share === null ? 0 : Math.min(1, share) * 100;
  const isOver = share !== null && share > 1;
  return (
    <section aria-label={expense.label} className={FIGURE_CLASS}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="font-medium">{expense.label}</h3>
        <p className="text-sm text-muted">{expense.caption}</p>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <svg viewBox="0 0 36 36" aria-hidden className="size-14 shrink-0 -rotate-90 sm:size-20">
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            strokeWidth="3.5"
            className="stroke-sunken"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${100 - filled}`}
            className={isOver ? 'stroke-negative' : 'stroke-ramp-3'}
          />
        </svg>
        <div className="flex min-w-0 flex-col">
          <p className="font-display text-2xl tracking-tight tabular-nums sm:text-3xl">
            {share === null ? '—' : fmt.percent(share)}
          </p>
          <p className="text-sm text-muted">of income spent</p>
        </div>
      </div>
      <p className="mt-2 text-sm tabular-nums">
        <Link href={expense.href} className="font-medium hover:underline">
          {chf(fmt, expense.value)}
        </Link>{' '}
        <span className="text-muted">out of {chf(fmt, incomeValue)} in</span>
      </p>
      <p className={`text-sm tabular-nums ${kept < 0 ? 'text-negative' : 'text-positive'}`}>
        {kept < 0 ? 'Overspent' : 'Kept'} {chf(fmt, Math.abs(kept))}
      </p>
      {expense.change && (
        <div className="mt-auto pt-2">
          <ChangeLine change={expense.change} fmt={fmt} />
        </div>
      )}
      {expense.unconverted.count > 0 && <UnconvertedNote {...expense.unconverted} />}
    </section>
  );
}

export const EXPENSE_VARIANT_COMPONENTS = {
  A: ExpenseVariantA,
  B: ExpenseVariantB,
  C: ExpenseVariantC,
} as const;

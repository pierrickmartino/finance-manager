import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { KeyFigureChange } from '@/server/services/analytics';

/** A change's arrow and sign by its direction. */
const DIRECTIONS = {
  up: { arrow: '↗', sign: '+', word: 'Up' },
  down: { arrow: '↘', sign: '−', word: 'Down' },
  flat: { arrow: '→', sign: '', word: 'Unchanged' },
} as const;

/** Good in `positive`, bad in `negative`: more spending never shows in green. */
function toneOf(isGood: boolean | null): string {
  if (isGood === null) return 'text-muted';
  return isGood ? 'text-positive' : 'text-negative';
}

interface ChangeLineProps {
  change: KeyFigureChange;
  fmt: Formatter;
}

/**
 * A Key figure's change line under its amount: the arrow, the absolute change, the % when there
 * is one, and the dates it is compared with ("↗ +CHF 500 · +25.0% vs 1–22 Oct"). It opens the
 * Transactions of both stretches, or for Net worth the Accounts it is compared with.
 */
export function ChangeLine({ change, fmt }: ChangeLineProps) {
  const { arrow, sign, word } = DIRECTIONS[change.direction];
  const amount = `${sign}${fmt.amount(Math.abs(change.amount), { currency: 'CHF', isWhole: true })}`;
  const percent =
    change.percent === null ? null : `${sign}${fmt.percent(Math.abs(change.percent))}`;
  const figures = [amount, percent].filter(Boolean).join(' · ');
  const said = `${word} ${figures} ${change.label}`;
  return (
    <Link
      href={change.href}
      aria-label={said}
      title={said}
      className="inline-flex flex-wrap items-baseline gap-x-1 text-sm tabular-nums hover:underline"
    >
      <span className={toneOf(change.isGood)}>
        <span aria-hidden className="mr-0.5">
          {arrow}
        </span>
        {figures}
      </span>
      <span className="text-muted">{change.label}</span>
    </Link>
  );
}

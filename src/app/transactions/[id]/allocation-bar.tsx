import type { SplitAllocation } from './split-lines';

const LINE_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
];

const STATUS_CLASS: Record<SplitAllocation['status'], string> = {
  balanced: 'text-emerald-700 dark:text-emerald-400',
  under: 'text-amber-700 dark:text-amber-400',
  over: 'text-rose-600 dark:text-rose-400',
  invalid: 'text-rose-600 dark:text-rose-400',
};

const STATUS_LABEL: Record<SplitAllocation['status'], string> = {
  balanced: 'balanced',
  under: 'left to allocate',
  over: 'over the amount',
  invalid: 'an amount is not valid',
};

/** The colour a Split line has in the bar, so the line and its segment match. */
export function lineColor(index: number): string {
  return LINE_COLORS[index % LINE_COLORS.length] ?? 'bg-sky-500';
}

interface AllocationBarProps {
  totalMinor: number;
  allocation: SplitAllocation;
  /** Formats an amount (minor units) in the Transaction's Currency. */
  formatAmount: (minor: number) => string;
}

/**
 * How much of the Transaction's amount each Split line takes, as one bar of coloured segments,
 * with what remains to allocate. A bar beyond the amount is scaled to fit and flagged.
 */
export function AllocationBar({ totalMinor, allocation, formatAmount }: AllocationBarProps) {
  const { parts, remaining, status } = allocation;
  const allocated = parts.reduce((sum, minor) => sum + minor, 0);
  const scale = Math.max(Math.abs(totalMinor), Math.abs(allocated), 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="tabular-nums">
          {formatAmount(allocated)}{' '}
          <span className="text-zinc-500">of {formatAmount(totalMinor)}</span>
        </span>
        <p aria-live="polite" className={`font-medium ${STATUS_CLASS[status]}`}>
          Remaining:{' '}
          <span className="tabular-nums" data-testid="split-remaining">
            {remaining === null ? '—' : formatAmount(remaining)}
          </span>{' '}
          <span className="font-normal">({STATUS_LABEL[status]})</span>
        </p>
      </div>
      <div
        aria-hidden="true"
        className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        {parts.map((minor, index) => (
          <div
            key={index}
            className={`${lineColor(index)} border-r-2 border-white last:border-r-0 dark:border-zinc-900`}
            style={{ width: `${(Math.abs(minor) / scale) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

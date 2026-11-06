import type { SplitAllocation } from './split-lines';

/** The chart palette's categorical order (../../dashboards/chart-palette.ts). */
const LINE_COLORS = [
  'bg-[#2a78d6]',
  'bg-[#eb6834]',
  'bg-[#1baf7a]',
  'bg-[#eda100]',
  'bg-[#e87ba4]',
  'bg-[#008300]',
  'bg-[#6250d6]',
  'bg-[#e34948]',
];

const STATUS_CLASS: Record<SplitAllocation['status'], string> = {
  balanced: 'text-positive',
  under: 'text-warning',
  over: 'text-negative',
  invalid: 'text-negative',
};

const STATUS_LABEL: Record<SplitAllocation['status'], string> = {
  balanced: 'balanced',
  under: 'left to allocate',
  over: 'over the amount',
  invalid: 'an amount is not valid',
};

/** The colour a Split line has in the bar, so the line and its segment match. */
export function lineColor(index: number): string {
  return LINE_COLORS[index % LINE_COLORS.length] ?? 'bg-[#2a78d6]';
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
          <span className="text-muted">of {formatAmount(totalMinor)}</span>
        </span>
        <p aria-live="polite" className={`font-medium ${STATUS_CLASS[status]}`}>
          Remaining:{' '}
          <span className="tabular-nums" data-testid="split-remaining">
            {remaining === null ? '—' : formatAmount(remaining)}
          </span>{' '}
          <span className="font-normal">({STATUS_LABEL[status]})</span>
        </p>
      </div>
      <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-sunken">
        {parts.map((minor, index) => (
          <div
            key={index}
            className={`${lineColor(index)} border-r-2 border-surface last:border-r-0`}
            style={{ width: `${(Math.abs(minor) / scale) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

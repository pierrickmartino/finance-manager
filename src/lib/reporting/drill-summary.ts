import type { CellTransactionPage } from '@/server/services/reporting/drill';
import type { TimeAxis, WidgetQuery } from '@/server/services/reporting/query';
import { includesCapital } from '@/server/services/reporting/sql';
import { divideRounded } from './average';
import { changeOverAverage } from './overview';
import { queryFilterLists, type FilterChoices } from './query-filters';

/**
 * What a Drill-down says above its Transactions (GLOSSARY: Drill-down): the number clicked,
 * with its working, and the filters it was counted under.
 */

/** The parts of a Drill-down its headline is worked out from. */
export type DrillNumber = Pick<
  CellTransactionPage,
  'measure' | 'averagePer' | 'value' | 'periodCount' | 'total' | 'sumChfMinor'
>;

const PERIOD_NAMES: Record<TimeAxis, string> = { month: 'month', quarter: 'quarter', year: 'year' };

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The number clicked, worked out from the Transactions listed: "14 Transactions, total CHF
 * 1,240" for a sum, "14 Transactions" for a count, "CHF 3,600 ÷ 12 months = CHF 300 / month"
 * for an average.
 */
export function drillHeadline(number: DrillNumber, formatChf: (minor: number) => string): string {
  const { measure, value, total, sumChfMinor } = number;
  if (total === 0 || value === null) return 'No Transactions';
  if (measure === 'count') return plural(total, 'Transaction');
  if (measure === 'sum') return `${plural(total, 'Transaction')}, total ${formatChf(value)}`;
  const period = PERIOD_NAMES[number.averagePer];
  return `${formatChf(sumChfMinor ?? 0)} ÷ ${plural(number.periodCount, period)} = ${formatChf(value)} / ${period}`;
}

/** One period's subtotal, labelled. */
export interface LabelledSubtotal {
  label: string;
  sumChfMinor: number;
}

/** A change as the insight rounds it, signed: "+12%", "−60%", "0%". */
function signedPercent(change: number): string {
  const points = Math.round(Math.abs(change) * 100);
  if (points === 0) return '0%';
  return `${change > 0 ? '+' : '−'}${points}%`;
}

/**
 * A change worked out from the periods' subtotals, newest first: the newest against the one
 * before ("March CHF 1,240 · February CHF 1,107 → +12%"), or against the average of all the
 * ones before when there are more. Spending (no period above zero) is stated as positive
 * amounts, as the insight speaks of it; the change is the same either way. Null without a
 * period to compare with.
 */
export function changeWorking(
  periods: LabelledSubtotal[],
  formatChf: (minor: number) => string,
): string | null {
  const isSpending = periods.every((period) => period.sumChfMinor <= 0);
  const shown = isSpending
    ? periods.map((period) => ({ ...period, sumChfMinor: Math.abs(period.sumChfMinor) }))
    : periods;
  const [latest, ...before] = shown;
  if (!latest || before.length === 0) return null;
  const sums = before.map((period) => period.sumChfMinor);
  const parts = shown.map((period) => `${period.label} ${formatChf(period.sumChfMinor)}`);
  const average =
    before.length > 1 ? [`average before ${formatChf(divideRounded(sum(sums), sums.length))}`] : [];
  const change = signedPercent(changeOverAverage(latest.sumChfMinor, sums));
  return `${[...parts, ...average].join(' · ')} → ${change}`;
}

/**
 * The filters in words: the period, then each filter of the query with the names it selects,
 * then what reports always leave out (Capital unless asked for, and Transfers).
 */
export function drillFilterLine(
  query: WidgetQuery,
  choices: FilterChoices,
  period: string,
): string[] {
  const filters = queryFilterLists(query.filters, choices)
    .filter((list) => list.selected.length > 0)
    .map((list) => {
      const names = list.selected.map((value) => {
        const option = list.options.find((item) => item.value === value);
        if (!option) return 'Unknown';
        return option.group ? `${option.group} › ${option.label}` : option.label;
      });
      return `${list.label}: ${names.join(', ')}`;
    });
  return [
    period,
    ...filters,
    ...(includesCapital(query) ? [] : ['Capital left out']),
    'Transfers left out',
  ];
}

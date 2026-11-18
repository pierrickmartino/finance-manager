import { listAccounts, type Account } from '../accounts';
import {
  listAccountBalances,
  nativeBalancesAt,
  type AccountBalance,
  type DatedAccount,
} from '../accounts/balances';
import type { ServiceContext } from '../context';
import { loadRateTable } from '../fx';
import { swissToday } from '../fx/dates';
import type { ReportTable } from './engine';
import { axisHeaders, type ReportHeader } from './headers';
import { periodSpan, resolveRange, type DateSpan } from './periods';
import { isTimeAxis, type ReportFilters, type TimeAxis, type WidgetQuery } from './query';

/** The single column of the Account balances table. */
export const BALANCE_COLUMN: ReportHeader = {
  key: null,
  label: 'Balance in CHF',
  isPartial: false,
};

/** The single column of Net worth over time. */
export const NET_WORTH_COLUMN: ReportHeader = {
  key: null,
  label: 'Net worth in CHF',
  isPartial: false,
};

/**
 * Whether an Account counts under a balances Widget's filters: its Account, Bank and Account
 * kind filters, each letting everything through when empty. Classification filters (Category,
 * Payee, Tag, group type, Currency) mean nothing for a balance and are ignored.
 */
function isIncluded(account: Account, filters: ReportFilters): boolean {
  const allows = (values: readonly string[] | undefined, value: string) =>
    !values || values.length === 0 || values.includes(value);
  return (
    allows(filters.accountIds, account.id) &&
    allows(filters.bankIds, account.bankId) &&
    allows(filters.accountKinds, account.kind)
  );
}

/** An archived Account shows only while it still holds money. */
function isShown(balance: AccountBalance): boolean {
  return balance.account.archivedAt === null || balance.balanceMinor !== 0;
}

/**
 * The Account balances in CHF: with no time axis, on a date (default today), one row per
 * Account (key = Account id) and one column, shaped like a Widget query's result so every
 * visualisation can show it. With a month, quarter or year axis, Net worth over time
 * (`runNetWorth`). Accounts with no FX rate yet are left out of the totals and counted in
 * `unconvertedCount`.
 */
export async function runAccountBalances(
  ctx: ServiceContext,
  query: WidgetQuery,
  options: { date?: string } = {},
): Promise<ReportTable> {
  if (isTimeAxis(query.rows)) return runNetWorth(ctx, query, query.rows);
  const balances = (await listAccountBalances(ctx, options)).filter(
    (balance) => isShown(balance) && isIncluded(balance.account, query.filters),
  );
  const date = balances[0]?.date ?? options.date ?? swissToday();
  const values = balances.map((balance) => balance.chf?.amountMinor ?? null);
  const converted = values.filter((value): value is number => value !== null);
  const total = converted.length === 0 ? null : converted.reduce((sum, value) => sum + value, 0);
  return {
    query: { ...query, rows: 'account', columns: null, measure: 'sum' },
    range: { from: date, to: date },
    partialPeriod: null,
    rows: balances.map(({ account }) => ({
      key: account.id,
      label: `${account.bankName} · ${account.name}`,
      isPartial: false,
    })),
    columns: [BALANCE_COLUMN],
    cells: values.map((value) => [value]),
    rowTotals: values,
    columnTotals: [total],
    total,
    unconvertedCount: balances.length - converted.length,
  };
}

/**
 * The day a Net worth point stands for: its period's last day, or the range's end when the
 * range stops earlier (a fixed range, or the current period up to today).
 */
export function netWorthPointDate(key: string, axis: TimeAxis, range: DateSpan): string {
  const end = periodSpan(key, axis).to;
  return end < range.to ? end : range.to;
}

/** An Account adds nothing before its opening date. */
function isOpenOn(account: Account, date: string): boolean {
  return account.openingDate === null || account.openingDate <= date;
}

/**
 * Net worth over time (ADR-0014): per period, every Account's balance at the end of the
 * period's last day, as the Accounts page computes it, converted at that day's FX rate
 * (ADR-0002) and summed. The total is the latest point's: Net worth is a stock.
 */
async function runNetWorth(
  ctx: ServiceContext,
  query: WidgetQuery,
  axis: TimeAxis,
): Promise<ReportTable> {
  const resolved = resolveRange(query.dateRange, swissToday());
  const { range, partialPeriod } = resolved;
  const accounts = (await listAccounts(ctx)).filter((account) =>
    isIncluded(account, query.filters),
  );
  // No Account left to count: no points at all, rather than a flat line at zero.
  const rows =
    accounts.length === 0 ? [] : await axisHeaders(ctx.db, axis, new Set(), range, partialPeriod);
  const dates = rows.map((row) => netWorthPointDate(row.key!, axis, range));
  const asked: DatedAccount[] = dates.flatMap((date) =>
    accounts.filter((account) => isOpenOn(account, date)).map((account) => ({ account, date })),
  );
  const [balances, rates] = await Promise.all([
    nativeBalancesAt(ctx.db, asked),
    dates.length === 0 ? null : loadRateTable(ctx, { from: dates[0]!, to: dates.at(-1)! }),
  ]);
  const values = new Map(dates.map((date) => [date, 0]));
  const unconverted = new Set<string>();
  asked.forEach(({ account, date }, index) => {
    const balanceMinor = balances[index]!;
    if (balanceMinor === 0) return;
    const chf = rates?.toChf(balanceMinor, account.currency, date);
    if (!chf) unconverted.add(account.id);
    else values.set(date, values.get(date)! + chf.amountMinor);
  });
  const points = dates.map((date) => values.get(date)!);
  const latest = points.at(-1) ?? null;
  return {
    query: { ...query, rows: axis, columns: null, measure: 'sum' },
    range,
    partialPeriod,
    rows,
    columns: [NET_WORTH_COLUMN],
    cells: points.map((value) => [value]),
    rowTotals: points,
    columnTotals: [latest],
    total: latest,
    unconvertedCount: unconverted.size,
  };
}

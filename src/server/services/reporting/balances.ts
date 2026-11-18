import { listAccounts, type Account } from '../accounts';
import { ACCOUNT_KIND_LABELS, ACCOUNT_KINDS, type AccountKind } from '../accounts/input';
import {
  listAccountBalances,
  nativeBalancesAt,
  type AccountBalance,
  type DatedAccount,
} from '../accounts/balances';
import type { ServiceContext } from '../context';
import { loadRateTable } from '../fx';
import { swissToday } from '../fx/dates';
import { listCapitalMarkers } from './capital-markers';
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
 * The day a Net worth point stands for: its period's last day, even when the range stops
 * earlier, or today while the period is still running.
 */
export function netWorthPointDate(key: string, axis: TimeAxis, today: string): string {
  const end = periodSpan(key, axis).to;
  return end > today ? today : end;
}

/** An Account adds nothing before its opening date. */
function isOpenOn(account: Account, date: string): boolean {
  return account.openingDate === null || account.openingDate <= date;
}

/** One column per Account kind held, in the kinds' order (key = the kind). */
function kindColumns(accounts: readonly Account[]): ReportHeader[] {
  const held = new Set(accounts.map((account) => account.kind));
  return ACCOUNT_KINDS.filter((kind) => held.has(kind)).map((kind) => ({
    key: kind,
    label: ACCOUNT_KIND_LABELS[kind],
    isPartial: false,
  }));
}

/**
 * Net worth over time (ADR-0014): per period, every Account's balance at the end of the
 * period's last day, as the Accounts page computes it, converted at that day's FX rate
 * (ADR-0002). Each period has one value per Account kind (loans below zero), and its row
 * total is its Net worth. The range's values are its latest point's: Net worth is a stock.
 */
async function runNetWorth(
  ctx: ServiceContext,
  query: WidgetQuery,
  axis: TimeAxis,
): Promise<ReportTable> {
  const today = swissToday();
  const { range, partialPeriod } = resolveRange(query.dateRange, today);
  const accounts = (await listAccounts(ctx)).filter((account) =>
    isIncluded(account, query.filters),
  );
  // No Account left to count: no points at all, rather than a flat line at zero.
  const headers =
    accounts.length === 0 ? [] : await axisHeaders(ctx.db, axis, new Set(), range, partialPeriod);
  const rows = headers
    .filter((row) => periodSpan(row.key!, axis).from <= today)
    .map((row) => ({ ...row, isPartial: row.isPartial || periodSpan(row.key!, axis).to > today }));
  const dates = rows.map((row) => netWorthPointDate(row.key!, axis, today));
  const asked: DatedAccount[] = dates.flatMap((date) =>
    accounts.filter((account) => isOpenOn(account, date)).map((account) => ({ account, date })),
  );
  const [balances, rates, markers] = await Promise.all([
    nativeBalancesAt(ctx.db, asked),
    dates.length === 0 ? null : loadRateTable(ctx, { from: dates[0]!, to: dates.at(-1)! }),
    listCapitalMarkers(
      ctx,
      accounts.map((account) => account.id),
      range,
    ),
  ]);
  const columns = kindColumns(asked.map(({ account }) => account));
  const kinds = columns.map((column) => column.key as AccountKind);
  const cells = dates.map(() => kinds.map(() => 0));
  const unconverted = new Set<string>();
  asked.forEach(({ account, date }, index) => {
    const balanceMinor = balances[index]!;
    if (balanceMinor === 0) return;
    const chf = rates?.toChf(balanceMinor, account.currency, date);
    if (!chf) unconverted.add(account.id);
    else cells[dates.indexOf(date)]![kinds.indexOf(account.kind)]! += chf.amountMinor;
  });
  const points = cells.map((row) => row.reduce((sum, value) => sum + value, 0));
  const latest = points.at(-1) ?? null;
  return {
    query: { ...query, rows: axis, columns: null, measure: 'sum' },
    range,
    partialPeriod,
    rows,
    columns,
    cells,
    rowTotals: points,
    columnTotals: cells.at(-1) ?? kinds.map(() => null),
    total: latest,
    unconvertedCount: unconverted.size,
    markers,
  };
}

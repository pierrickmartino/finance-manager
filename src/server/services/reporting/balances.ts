import { listAccounts, type Account } from '../accounts';
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KINDS,
  matchesKinds,
  type AccountKind,
} from '../accounts/input';
import {
  listAccountBalances,
  nativeBalancesAt,
  type AccountBalance,
  type DatedAccount,
} from '../accounts/balances';
import type { ServiceContext } from '../context';
import { loadRateTable } from '../fx';
import { swissToday } from '../fx/dates';
import { listCapitalMarkers, type CapitalMarker } from './capital-markers';
import type { ReportTable } from './engine';
import { axisHeaders, type ReportHeader } from './headers';
import { periodSpan, resolveRange, type ResolvedRange } from './periods';
import { isTimeAxis, type ReportFilters, type TimeAxis, type WidgetQuery } from './query';

/** The single column of the Account balances table. */
export const BALANCE_COLUMN: ReportHeader = {
  key: null,
  label: 'Balance in CHF',
  isPartial: false,
};

/**
 * Whether an Account counts under a balances Widget's filters: its Account, Bank and account
 * kind filters, each letting everything through when empty. Classification filters (Category,
 * Payee, Tag, group type, Currency) mean nothing for a balance and are ignored.
 */
function isIncluded(account: Account, filters: ReportFilters): boolean {
  const allows = (values: readonly string[] | undefined, value: string) =>
    !values || values.length === 0 || values.includes(value);
  return (
    allows(filters.accountIds, account.id) &&
    allows(filters.bankIds, account.bankId) &&
    matchesKinds(account.kind, filters.accountKinds)
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

/** The account kinds the Accounts hold, in the kinds' order. */
function heldKinds(accounts: readonly Account[]): AccountKind[] {
  const held = new Set(accounts.map((account) => account.kind));
  return ACCOUNT_KINDS.filter((kind) => held.has(kind));
}

/**
 * The periods of the range with a Net worth point: none yet to come, and one still running
 * today flagged partial (its point stands at today).
 */
async function pointRows(
  ctx: ServiceContext,
  axis: TimeAxis,
  { range, partialPeriod }: ResolvedRange,
  today: string,
): Promise<ReportHeader[]> {
  const headers = await axisHeaders(ctx.db, axis, new Set(), range, partialPeriod);
  return headers.flatMap((row) => {
    const period = periodSpan(row.key!, axis);
    if (period.from > today) return [];
    return [{ ...row, isPartial: row.isPartial || period.to > today }];
  });
}

/** An Account's balance on a point's date in CHF; null with no FX rate for it. */
interface ValuedBalance extends DatedAccount {
  chfMinor: number | null;
}

/**
 * Every Account open on each date, its balance at the end of that day converted at that
 * day's FX rate (ADR-0002). A zero balance needs no rate.
 */
async function valueBalances(
  ctx: ServiceContext,
  accounts: readonly Account[],
  dates: readonly string[],
): Promise<ValuedBalance[]> {
  if (dates.length === 0) return [];
  const asked: DatedAccount[] = dates.flatMap((date) =>
    accounts.filter((account) => isOpenOn(account, date)).map((account) => ({ account, date })),
  );
  const [balances, rates] = await Promise.all([
    nativeBalancesAt(ctx.db, asked),
    loadRateTable(ctx, { from: dates[0]!, to: dates.at(-1)! }),
  ]);
  return asked.map(({ account, date }, index) => {
    const balanceMinor = balances[index]!;
    const chfMinor =
      balanceMinor === 0
        ? 0
        : (rates.toChf(balanceMinor, account.currency, date)?.amountMinor ?? null);
    return { account, date, chfMinor };
  });
}

/** `cells[point][kind]`: the CHF sum of each kind's converted balances at each date. */
function kindCells(
  valued: readonly ValuedBalance[],
  dates: readonly string[],
  kinds: readonly AccountKind[],
): number[][] {
  return dates.map((date) =>
    kinds.map((kind) =>
      valued
        .filter((balance) => balance.date === date && balance.account.kind === kind)
        .reduce((sum, balance) => sum + (balance.chfMinor ?? 0), 0),
    ),
  );
}

/** What a Net worth table is built from. */
interface NetWorthParts {
  query: WidgetQuery;
  axis: TimeAxis;
  resolved: ResolvedRange;
  rows: ReportHeader[];
  dates: string[];
  valued: ValuedBalance[];
  markers: CapitalMarker[];
}

/**
 * The Net worth table: one row per point, one column per account kind held (loans below zero),
 * each row's total its Net worth, and the range's values its latest point's (a stock).
 */
function netWorthTable({
  query,
  axis,
  resolved,
  rows,
  dates,
  valued,
  markers,
}: NetWorthParts): ReportTable {
  const kinds = heldKinds(valued.map(({ account }) => account));
  const cells = kindCells(valued, dates, kinds);
  const points = cells.map((row) => row.reduce((sum, value) => sum + value, 0));
  const unconverted = valued.filter((balance) => balance.chfMinor === null);
  return {
    query: { ...query, rows: axis, columns: null, measure: 'sum' },
    range: resolved.range,
    partialPeriod: resolved.partialPeriod,
    rows,
    columns: kinds.map((kind) => ({
      key: kind,
      label: ACCOUNT_KIND_LABELS[kind],
      isPartial: false,
    })),
    cells,
    rowTotals: points,
    columnTotals: cells.at(-1) ?? kinds.map(() => null),
    total: points.at(-1) ?? null,
    unconvertedCount: new Set(unconverted.map(({ account }) => account.id)).size,
    markers,
  };
}

/**
 * Net worth over time (ADR-0014): per period, every Account's balance at the end of the
 * period's last day (today, while it runs), as the Accounts page computes it, converted at
 * that day's FX rate (ADR-0002), and the capital movements on those Accounts in the range.
 */
async function runNetWorth(
  ctx: ServiceContext,
  query: WidgetQuery,
  axis: TimeAxis,
): Promise<ReportTable> {
  const today = swissToday();
  const resolved = resolveRange(query.dateRange, today);
  const accounts = (await listAccounts(ctx)).filter((account) =>
    isIncluded(account, query.filters),
  );
  // No Account left to count: no points at all, rather than a flat line at zero.
  const rows = accounts.length === 0 ? [] : await pointRows(ctx, axis, resolved, today);
  const dates = rows.map((row) => netWorthPointDate(row.key!, axis, today));
  const accountIds = accounts.map((account) => account.id);
  const [valued, markers] = await Promise.all([
    valueBalances(ctx, accounts, dates),
    listCapitalMarkers(ctx, accountIds, resolved.range),
  ]);
  return netWorthTable({ query, axis, resolved, rows, dates, valued, markers });
}

/** How far back a Net worth trend reaches: `count` complete periods before the running one. */
export interface NetWorthTrendSpan {
  unit: TimeAxis;
  count: number;
}

/**
 * A Net worth trend's query: every Account, no filters, by `unit`: the running period at
 * today, so its latest point is net worth today, and the `count` complete periods before it.
 */
function netWorthTrendQuery({ unit, count }: NetWorthTrendSpan): WidgetQuery {
  return {
    dateRange: { kind: 'last', count, unit, includeCurrent: true },
    rows: unit,
    columns: null,
    measure: 'sum',
    averagePer: unit,
    filters: {},
    includeCapital: false,
  };
}

/**
 * The overview headline's span: by month, the 24 full months before the running one, so the
 * change over two years has its point.
 */
const HEADLINE_SPAN: NetWorthTrendSpan = { unit: 'month', count: 24 };

/** The query of the overview headline's Net worth trend. */
export const NET_WORTH_TREND_QUERY: WidgetQuery = netWorthTrendQuery(HEADLINE_SPAN);

/**
 * A Net worth trend: Net worth over time on every Account, valued as a Net worth Widget's
 * points are (ADR-0014), whatever any Widget's filters. By default the overview headline's
 * (GLOSSARY: Dashboard Story); Analytics reads one per grain of its Span.
 */
export function runNetWorthTrend(
  ctx: ServiceContext,
  span: NetWorthTrendSpan = HEADLINE_SPAN,
): Promise<ReportTable> {
  return runNetWorth(ctx, netWorthTrendQuery(span), span.unit);
}

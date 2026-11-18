import 'server-only';
import { notFound } from 'next/navigation';
import { timeAxisOf } from '@/lib/reporting/card';
import type { ChartSource } from '@/lib/reporting/chart-data';
import type { DrillOrigin } from '@/lib/reporting/drill-origin';
import { queryToParams } from '@/lib/reporting/widget-params';
import type { ServiceContext } from '@/server/services/context';
import { getDashboard, type DashboardWithWidgets } from '@/server/services/dashboards';
import { NotFoundError, ServiceError } from '@/server/services/errors';
import {
  netWorthPointDate,
  runNetWorthTrend,
  runSavedWidget,
  type CellRef,
  type ReportTable,
  type Widget,
} from '@/server/services/reporting';
import { daysBetween, swissToday } from '@/server/services/fx/dates';
import type { TimeAxis } from '@/server/services/reporting/query';
import { isAccountKind } from '@/server/services/accounts/input';
import { accountsHref } from '../accounts/view';
import { listTransactions } from '@/server/services/transactions';
import { categoryText, transactionName } from '../transactions/transaction-display';
import { drillLinks, toPivotData, type PivotLinks } from '../widgets/pivot-data';
import type { RecentActivity } from './(dashboard)/[id]/overview/overview-row';
import type { BoardCard } from './(dashboard)/[id]/overview/widget-board';

export interface WidgetView {
  data: ChartSource | null;
  /** Transactions (or Accounts) left out for want of an FX rate. */
  unconvertedCount: number;
  error: string | null;
}

/** An Account balance links to its Account, the total to the Accounts page. */
export function balanceHref(cell: CellRef): string {
  return typeof cell.row === 'string' ? `/accounts/${cell.row}` : '/accounts';
}

/** Account balances aren't Transactions: no Drill-down, only their Accounts. */
export const BALANCE_LINKS: PivotLinks = { hrefOf: balanceHref, drill: null };

/**
 * Net worth over time links each point to the Accounts as they stood on its date, a band's
 * point to that account kind's Accounts then, and the range's values (its latest point's) to
 * the latest date. No Drill-down: balances aren't Transactions.
 */
export function netWorthLinks(report: ReportTable, axis: TimeAxis): PivotLinks {
  const latest = report.rows.at(-1)?.key;
  const dateOf = (key: string | null | undefined) =>
    typeof key === 'string' ? netWorthPointDate(key, axis, swissToday()) : undefined;
  return {
    hrefOf: (cell) =>
      accountsHref({
        date: dateOf(typeof cell.row === 'string' ? cell.row : latest),
        kind: isAccountKind(cell.column) ? cell.column : undefined,
      }),
    drill: null,
  };
}

/**
 * Where a saved Widget's values link: its Drill-downs from `origin`, the balances' Accounts,
 * or for Net worth over time the Accounts as of each point.
 */
export function widgetLinks(
  widget: Pick<Widget, 'source'>,
  report: ReportTable,
  origin: DrillOrigin,
): PivotLinks {
  if (widget.source !== 'account_balances') return drillLinks(report, origin);
  const axis = timeAxisOf(report.query);
  return axis ? netWorthLinks(report, axis) : BALANCE_LINKS;
}

/**
 * Runs a Widget into what its visualisation draws, Drill-down links included: they lead back
 * to its Dashboard's Story, or to the Widget's own page when it stands alone.
 */
export async function loadWidgetView(ctx: ServiceContext, widget: Widget): Promise<WidgetView> {
  try {
    const report = await runSavedWidget(ctx, widget);
    const origin: DrillOrigin = widget.dashboardId
      ? { kind: 'dashboard', id: widget.dashboardId }
      : { kind: 'widget', id: widget.id };
    const data = toPivotData(report, widgetLinks(widget, report, origin));
    return { data, unconvertedCount: report.unconvertedCount, error: null };
  } catch (error: unknown) {
    if (error instanceof ServiceError) {
      return { data: null, unconvertedCount: 0, error: error.message };
    }
    throw error;
  }
}

/** A Widget run into its card's data, with the card's place and size on the board. */
export async function loadWidgetCard(ctx: ServiceContext, widget: Widget): Promise<BoardCard> {
  const view = await loadWidgetView(ctx, widget);
  return {
    id: widget.id,
    name: widget.name,
    source: widget.source,
    visualisation: widget.visualisation,
    query: widget.query,
    layout: widget.layout,
    ...view,
  };
}

/**
 * The overview headline's Net worth trend, when the headline can be net worth today (the
 * Dashboard holds Account balances on a date): every Account by month over the last 24
 * months, its points opening the Accounts as of their date and its capital movements their
 * Transaction. Null otherwise.
 */
export async function loadNetWorthTrend(
  ctx: ServiceContext,
  widgets: readonly Pick<Widget, 'source' | 'query'>[],
): Promise<ChartSource | null> {
  const hasBalances = widgets.some(
    (widget) => widget.source === 'account_balances' && timeAxisOf(widget.query) === null,
  );
  if (!hasBalances) return null;
  const report = await runNetWorthTrend(ctx);
  return toPivotData(report, netWorthLinks(report, 'month'));
}

/** The Widget editor, opened on a Widget (its query, visualisation and Dashboard in the URL). */
export function editWidgetHref(widget: Widget): string {
  const params = queryToParams(widget.query);
  params.set('widget', widget.id);
  params.set('vis', widget.visualisation);
  return `/widgets/new?${params}`;
}

/** A Dashboard and its Widgets, or the not-found page. */
export async function findDashboard(
  ctx: ServiceContext,
  id: string,
): Promise<DashboardWithWidgets> {
  try {
    return await getDashboard(ctx, id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** How many Transactions the Dashboard's recent activity lists. */
const RECENT_ACTIVITY_COUNT = 6;

/**
 * The latest Transactions, newest first, as the Dashboard's recent activity card lists them.
 * How long ago each was booked is counted here, from the Swiss date, so the page reads the same
 * on the server and in the browser.
 */
export async function loadRecentActivity(
  ctx: ServiceContext,
  today: string = swissToday(),
): Promise<RecentActivity[]> {
  const page = await listTransactions(ctx, { pageSize: RECENT_ACTIVITY_COUNT });
  return page.transactions.map((transaction) => ({
    id: transaction.id,
    name: transactionName(transaction),
    category: categoryText(transaction),
    bookingDate: transaction.bookingDate,
    daysAgo: daysBetween(transaction.bookingDate, today),
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
  }));
}

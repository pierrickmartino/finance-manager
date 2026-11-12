import 'server-only';
import { notFound } from 'next/navigation';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { queryToParams } from '@/lib/reporting/widget-params';
import type { ServiceContext } from '@/server/services/context';
import { getDashboard, type DashboardWithWidgets } from '@/server/services/dashboards';
import { NotFoundError, ServiceError } from '@/server/services/errors';
import { runSavedWidget, type CellRef, type Widget } from '@/server/services/reporting';
import { listTransactions } from '@/server/services/transactions';
import { categoryText, transactionName } from '../transactions/transaction-display';
import { toPivotData } from '../widgets/pivot-data';
import type { RecentActivity } from './[id]/overview/overview-row';
import type { BoardChapter } from './[id]/overview/widget-board';

export interface WidgetView {
  data: ChartSource | null;
  /** Transactions (or Accounts) left out for want of an FX rate. */
  unconvertedCount: number;
  error: string | null;
}

/** An Account balance links to its Account, the total to the Accounts page. */
export function balanceHref(cell: CellRef): string {
  return cell.row ? `/accounts/${cell.row}` : '/accounts';
}

/** Runs a Widget into what its visualisation draws (drill-down links included). */
export async function loadWidgetView(ctx: ServiceContext, widget: Widget): Promise<WidgetView> {
  try {
    const report = await runSavedWidget(ctx, widget);
    const data =
      widget.source === 'account_balances' ? toPivotData(report, balanceHref) : toPivotData(report);
    return { data, unconvertedCount: report.unconvertedCount, error: null };
  } catch (error: unknown) {
    if (error instanceof ServiceError) {
      return { data: null, unconvertedCount: 0, error: error.message };
    }
    throw error;
  }
}

/** A Widget run into its Story chapter, with its card's place and size on the board. */
export async function loadStoryChapter(ctx: ServiceContext, widget: Widget): Promise<BoardChapter> {
  const view = await loadWidgetView(ctx, widget);
  return {
    id: widget.id,
    name: widget.name,
    source: widget.source,
    visualisation: widget.visualisation,
    layout: widget.layout,
    ...view,
  };
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

/** The latest Transactions, newest first, as the Dashboard's recent activity card lists them. */
export async function loadRecentActivity(ctx: ServiceContext): Promise<RecentActivity[]> {
  const page = await listTransactions(ctx, { pageSize: RECENT_ACTIVITY_COUNT });
  return page.transactions.map((transaction) => ({
    id: transaction.id,
    name: transactionName(transaction),
    category: categoryText(transaction),
    bookingDate: transaction.bookingDate,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
  }));
}

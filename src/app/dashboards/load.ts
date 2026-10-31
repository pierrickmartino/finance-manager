import 'server-only';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { queryToParams } from '@/lib/reporting/widget-params';
import type { ServiceContext } from '@/server/services/context';
import { ServiceError } from '@/server/services/errors';
import { runSavedWidget, type CellRef, type Widget } from '@/server/services/reporting';
import { toPivotData } from '../reports/pivot-data';

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

/** The Widget editor, opened on a Widget (its query, visualisation and Dashboard in the URL). */
export function editWidgetHref(widget: Widget): string {
  const params = queryToParams(widget.query);
  params.set('widget', widget.id);
  params.set('vis', widget.visualisation);
  return `/reports/builder?${params}`;
}

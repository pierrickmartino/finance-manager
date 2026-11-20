import type { ChartCapital, ChartSource } from '@/lib/reporting/chart-data';
import { drillLinks, toChartSource, type PivotLinks } from '@/lib/reporting/pivot-source';
import type { ReportTable } from '@/server/services/reporting';
import { searchValues, transactionDetailHref, transactionsHref } from '../transactions/search';

/**
 * Net worth over time's capital movements: each opens its Transaction, and together they open
 * the Transactions list of Capital in the range. The list filters by one Account at most (and
 * by no Bank or account kind), so it narrows to the Widget's Account only when it counts one.
 */
function capitalOf(report: ReportTable): ChartCapital | undefined {
  if (!report.markers) return undefined;
  const { accountIds = [] } = report.query.filters;
  const values = searchValues({
    from: report.range.from,
    to: report.range.to,
    accountId: accountIds.length === 1 ? accountIds[0] : '',
    groupType: 'capital',
  });
  return {
    markers: report.markers.map((marker) => ({
      ...marker,
      href: transactionDetailHref(marker.transactionId, null),
    })),
    href: transactionsHref(values),
  };
}

/**
 * The engine's table with a link for every value: by default its Drill-down from the editor;
 * `links` link elsewhere (a Drill-down from a Dashboard or a Widget with `drillLinks`, or the
 * Account balances to each Account).
 */
export function toPivotData(
  report: ReportTable,
  links: PivotLinks = drillLinks(report),
): ChartSource {
  return {
    ...toChartSource(report, links),
    ...(report.markers && { capital: capitalOf(report) }),
  };
}

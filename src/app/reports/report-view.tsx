import type { ChartSource } from '@/lib/reporting/chart-data';
import { FieldError } from '@/components/form';
import { getFormatter } from '@/server/formatter';
import type { ReportTable, Visualisation } from '@/server/services/reporting';
import { WidgetVisualisation } from '../dashboards/widget-visualisation';
import { toPivotData } from './pivot-data';

/** A report's notes (range, partial period, unconverted amounts) and its visualisation. */
export async function ReportView({
  report,
  title,
  visualisation = 'table',
  data = toPivotData(report),
}: {
  report: ReportTable;
  title: string;
  visualisation?: Visualisation;
  /** The table with its links; by default each value drills down to its Transactions. */
  data?: ChartSource;
}) {
  const fmt = await getFormatter();
  const { range, partialPeriod } = report;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {range.from <= range.to
          ? `${fmt.date(range.from)} to ${fmt.date(range.to)}`
          : 'No complete period yet'}
        {partialPeriod &&
          ` · includes the current, incomplete period (${fmt.date(partialPeriod.from)} to ${fmt.date(partialPeriod.to)})`}
      </p>
      {report.unconvertedCount > 0 && (
        <FieldError
          message={`${report.unconvertedCount} Transaction${
            report.unconvertedCount === 1 ? ' is' : 's are'
          } left out: no FX rate on or before their date.`}
        />
      )}
      <WidgetVisualisation data={data} title={title} visualisation={visualisation} />
    </div>
  );
}

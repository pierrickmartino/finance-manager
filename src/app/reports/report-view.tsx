import { FieldError } from '@/components/form';
import { getFormatter } from '@/server/formatter';
import type { ReportTable } from '@/server/services/reporting';
import { toPivotData } from './pivot-data';
import { PivotTable } from './pivot-table';

/** A report's notes (range, partial period, unconverted amounts) and its pivot table. */
export async function ReportView({ report, title }: { report: ReportTable; title: string }) {
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
      <PivotTable data={toPivotData(report)} title={title} />
    </div>
  );
}

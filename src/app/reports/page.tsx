import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceContext } from '@/server/app-context';
import { AXIS_LABELS, listWidgets, MEASURE_LABELS } from '@/server/services/reporting';

export const metadata: Metadata = { title: 'Reports · Finance Manager' };

const CELL = 'px-3 py-2 text-left';

/** Saved Widgets, and the way into the Widget editor. */
export default async function ReportsPage() {
  const widgets = await listWidgets(await getServiceContext());
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <Link
          href="/reports/builder"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          New Widget
        </Link>
      </div>
      {widgets.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No Widgets yet. Build a report and save it as a Widget.
        </p>
      ) : (
        <table aria-label="Widgets" className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className={CELL}>Name</th>
              <th className={CELL}>Rows</th>
              <th className={CELL}>Columns</th>
              <th className={CELL}>Measure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {widgets.map((widget) => (
              <tr key={widget.id}>
                <td className={CELL}>
                  <Link href={`/reports/${widget.id}`} className="hover:underline">
                    {widget.name}
                  </Link>
                </td>
                <td className={CELL}>{widget.query.rows ? AXIS_LABELS[widget.query.rows] : '—'}</td>
                <td className={CELL}>
                  {widget.query.columns ? AXIS_LABELS[widget.query.columns] : '—'}
                </td>
                <td className={CELL}>{MEASURE_LABELS[widget.query.measure]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { AXIS_LABELS, listWidgets, MEASURE_LABELS } from '@/server/services/reporting';
import { PAGE_TITLE_CLASS } from '@/components/surface';

export const metadata: Metadata = { title: 'Widgets · Finance Manager' };

const CELL = 'px-3 py-2 text-left';

/** Every Widget, with the Dashboard it sits on, and the way into the Widget editor. */
export default async function WidgetsPage() {
  const ctx = await getServiceContext();
  const [widgets, dashboards] = await Promise.all([listWidgets(ctx), listDashboards(ctx)]);
  const dashboardNames = new Map(dashboards.map((dashboard) => [dashboard.id, dashboard.name]));
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className={PAGE_TITLE_CLASS}>Widgets</h1>
        <Link
          href="/widgets/new"
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-hover"
        >
          New Widget
        </Link>
      </div>
      {widgets.length === 0 ? (
        <p className="text-sm text-muted">
          No Widgets yet. Create one with New Widget, or add one from a Dashboard.
        </p>
      ) : (
        <table aria-label="Widgets" className="w-full text-sm">
          <thead className="border-b border-rule">
            <tr>
              <th className={CELL}>Name</th>
              <th className={CELL}>Rows</th>
              <th className={CELL}>Columns</th>
              <th className={CELL}>Measure</th>
              <th className={CELL}>Dashboard</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {widgets.map((widget) => (
              <tr key={widget.id}>
                <td className={CELL}>
                  <Link href={`/widgets/${widget.id}`} className="hover:underline">
                    {widget.name}
                  </Link>
                </td>
                <td className={CELL}>{widget.query.rows ? AXIS_LABELS[widget.query.rows] : '—'}</td>
                <td className={CELL}>
                  {widget.query.columns ? AXIS_LABELS[widget.query.columns] : '—'}
                </td>
                <td className={CELL}>{MEASURE_LABELS[widget.query.measure]}</td>
                <td className={CELL}>
                  {widget.dashboardId ? (
                    <Link href={`/dashboards/${widget.dashboardId}`} className="hover:underline">
                      {dashboardNames.get(widget.dashboardId)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

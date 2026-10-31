import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { queryToParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import { NotFoundError } from '@/server/services/errors';
import { getWidget, MEASURE_LABELS, type Widget } from '@/server/services/reporting';
import { deleteWidgetAction } from '../actions';
import { loadReport } from '../load';
import { ReportView } from '../report-view';

export const metadata: Metadata = { title: 'Widget · Finance Manager' };

async function findWidget(id: string): Promise<Widget> {
  try {
    return await getWidget(await getServiceContext(), id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** A saved Widget, shown as its table (Dashboards place it on a grid later). */
export default async function WidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const widget = await findWidget((await params).id);
  const { report, error } = await loadReport(widget.query);
  const editParams = queryToParams(widget.query);
  editParams.set('widget', widget.id);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{widget.name}</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/reports" className="underline">
            All Widgets
          </Link>
          <Link href={`/reports/builder?${editParams}`} className="underline">
            Edit
          </Link>
          <ActionForm
            action={deleteWidgetAction.bind(null, widget.id)}
            label="Delete Widget"
            confirmMessage={`Delete the Widget "${widget.name}"?`}
          >
            <button type="submit" className="text-red-700 underline dark:text-red-400">
              Delete
            </button>
          </ActionForm>
        </div>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {MEASURE_LABELS[widget.query.measure]} in CHF
      </p>
      {error && <FieldError message={error} />}
      {report && <ReportView report={report} title={widget.name} />}
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { FieldError, TextField } from '@/components/form';
import { queryFromParams, type UrlParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import { getWidget, type Widget } from '@/server/services/reporting';
import { NotFoundError } from '@/server/services/errors';
import { saveWidgetAction } from '../actions';
import { loadQueryFormLists, loadReport } from '../load';
import { QueryForm } from '../query-form';
import { ReportView } from '../report-view';

export const metadata: Metadata = { title: 'Widget editor · Finance Manager' };

interface BuilderPageProps {
  searchParams: Promise<UrlParams>;
}

async function loadWidget(id: string): Promise<Widget | null> {
  if (!id) return null;
  try {
    return await getWidget(await getServiceContext(), id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/**
 * The Widget editor: the query form, the report it gives, and saving it as a Widget. With
 * `widget=<id>` it edits that Widget (its query comes in the URL like any other).
 */
export default async function BuilderPage({ searchParams }: BuilderPageProps) {
  const params = await searchParams;
  const widgetId = typeof params.widget === 'string' ? params.widget : '';
  const query = queryFromParams(params);
  const [{ report, error }, lists, widget] = await Promise.all([
    loadReport(query),
    loadQueryFormLists(),
    loadWidget(widgetId),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {widget ? `Edit Widget: ${widget.name}` : 'New Widget'}
        </h1>
        <Link href="/reports" className="text-sm underline">
          All Widgets
        </Link>
      </div>

      <QueryForm query={query} lists={lists} hidden={widget ? { widget: widget.id } : {}} />

      {error && <FieldError message={error} />}

      {report && (
        <>
          <ReportView report={report} title={widget?.name ?? 'Report'} />
          <ActionForm action={saveWidgetAction} label="Save Widget">
            <input type="hidden" name="query" value={JSON.stringify(report.query)} />
            {widget && <input type="hidden" name="widgetId" value={widget.id} />}
            <TextField label="Widget name" name="name" defaultValue={widget?.name ?? ''} required />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {widget ? 'Update Widget' : 'Save Widget'}
            </button>
          </ActionForm>
        </>
      )}
    </section>
  );
}

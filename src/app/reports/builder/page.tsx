import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { FieldError, TextField } from '@/components/form';
import { queryFromParams, type UrlParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import {
  getWidget,
  runSavedWidget,
  VISUALISATION_LABELS,
  VISUALISATIONS,
  type ReportTable,
  type Visualisation,
  type Widget,
} from '@/server/services/reporting';
import { NotFoundError } from '@/server/services/errors';
import { balanceHref } from '../../dashboards/load';
import { saveWidgetAction } from '../actions';
import { loadQueryFormLists, loadReport } from '../load';
import { QueryForm } from '../query-form';
import { ReportView } from '../report-view';
import { toPivotData } from '../pivot-data';

export const metadata: Metadata = { title: 'Widget editor · Finance Manager' };

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

interface BuilderPageProps {
  searchParams: Promise<UrlParams>;
}

function param(params: UrlParams, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
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

function isVisualisation(value: string): value is Visualisation {
  return (VISUALISATIONS as readonly string[]).includes(value);
}

function VisualisationSelect({ value }: { value: Visualisation }) {
  return (
    <label className="flex w-fit flex-col gap-1 text-sm font-medium">
      Visualisation
      <select name="vis" defaultValue={value} className={INPUT}>
        {VISUALISATIONS.map((visualisation) => (
          <option key={visualisation} value={visualisation}>
            {VISUALISATION_LABELS[visualisation]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The Account balances Widget has no query: only its visualisation and name change. */
async function runBalancesWidget(widget: Widget): Promise<ReportTable> {
  return runSavedWidget(await getServiceContext(), widget);
}

/**
 * The Widget editor: the query form and visualisation, the report as it will show, and saving
 * it as a Widget. `widget=<id>` edits that Widget (its query comes in the URL like any other);
 * `dashboard=<id>` adds the new Widget to that Dashboard.
 */
export default async function BuilderPage({ searchParams }: BuilderPageProps) {
  const params = await searchParams;
  const widget = await loadWidget(param(params, 'widget'));
  const dashboardId = widget ? widget.dashboardId : param(params, 'dashboard') || null;
  const requested = param(params, 'vis');
  const visualisation = isVisualisation(requested) ? requested : (widget?.visualisation ?? 'table');
  const isBalances = widget?.source === 'account_balances';
  const query = isBalances ? widget.query : queryFromParams(params);
  const [{ report, error }, lists] = await Promise.all([
    isBalances
      ? runBalancesWidget(widget).then((table) => ({ report: table, error: null }))
      : loadReport(query),
    loadQueryFormLists(),
  ]);
  const hidden: Record<string, string> = {};
  if (widget) hidden.widget = widget.id;
  else if (dashboardId) hidden.dashboard = dashboardId;
  const backHref = dashboardId ? `/dashboards/${dashboardId}` : '/reports';

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {widget ? `Edit Widget: ${widget.name}` : 'New Widget'}
        </h1>
        <Link href={backHref} className="text-sm underline">
          {dashboardId ? 'Back to the Dashboard' : 'All Widgets'}
        </Link>
      </div>

      {isBalances ? (
        <form method="get" aria-label="Widget query" className="flex items-end gap-3">
          <input type="hidden" name="widget" value={widget.id} />
          <VisualisationSelect value={visualisation} />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Show report
          </button>
        </form>
      ) : (
        <QueryForm query={query} lists={lists} hidden={hidden}>
          <VisualisationSelect value={visualisation} />
        </QueryForm>
      )}

      {error && <FieldError message={error} />}

      {report && (
        <>
          <ReportView
            report={report}
            title={widget?.name ?? 'Report'}
            visualisation={visualisation}
            data={isBalances ? toPivotData(report, balanceHref) : undefined}
          />
          <ActionForm action={saveWidgetAction} label="Save Widget">
            <input type="hidden" name="query" value={JSON.stringify(report.query)} />
            <input type="hidden" name="visualisation" value={visualisation} />
            {widget && <input type="hidden" name="widgetId" value={widget.id} />}
            {!widget && dashboardId && (
              <input type="hidden" name="dashboardId" value={dashboardId} />
            )}
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

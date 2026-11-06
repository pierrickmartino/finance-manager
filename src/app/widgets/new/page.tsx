import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { queryFromParams, type UrlParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import {
  getWidget,
  runSavedWidget,
  VISUALISATIONS,
  type ReportTable,
  type Visualisation,
  type Widget,
} from '@/server/services/reporting';
import { NotFoundError } from '@/server/services/errors';
import { balanceHref } from '../../dashboards/load';
import { saveWidgetAction } from '../actions';
import { loadQueryFormLists, loadReport } from '../load';
import { AutoSubmitForm } from '../auto-submit-form';
import { PanelSection, VisualisationPicker } from '../editor-panel';
import { HiddenFields, QueryForm } from '../query-form';
import { WidgetView } from '../widget-view';
import { toPivotData } from '../pivot-data';

export const metadata: Metadata = { title: 'Widget editor · Finance Manager' };

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

/** The Account balances Widget has no query: only its visualisation and name change. */
async function runBalancesWidget(widget: Widget): Promise<ReportTable> {
  return runSavedWidget(await getServiceContext(), widget);
}

/** The editor with every field at its default, keeping the Widget or Dashboard. */
function resetHref(hidden: Record<string, string>): string {
  const params = new URLSearchParams(hidden).toString();
  return params ? `/widgets/new?${params}` : '/widgets/new';
}

/**
 * The Widget editor: a side panel with the visualisation and the query, and next to it the
 * report as it will show, refreshed on every change, under the name and Save. `widget=<id>` edits that Widget (its query comes in the URL like any other);
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
  const backHref = dashboardId ? `/dashboards/${dashboardId}/edit` : '/widgets';

  const visualisationSection = (
    <PanelSection title="Visualisation">
      <VisualisationPicker value={visualisation} />
    </PanelSection>
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-pretty">
          {widget ? `Edit Widget: ${widget.name}` : 'New Widget'}
        </h1>
        <Link href={backHref} className="text-sm underline">
          {dashboardId ? 'Back to the Dashboard' : 'All Widgets'}
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={`${CARD_CLASS} lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Settings</h2>
            {/* A full page load, so every field goes back to its default. */}
            <a
              href={resetHref(hidden)}
              className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              Reset
            </a>
          </div>
          {isBalances ? (
            <AutoSubmitForm action="/widgets/new" label="Widget query">
              <HiddenFields fields={hidden} />
              {visualisationSection}
            </AutoSubmitForm>
          ) : (
            <QueryForm query={query} lists={lists} hidden={hidden} shownRange={report?.range}>
              {visualisationSection}
            </QueryForm>
          )}
        </aside>

        <div className={`${CARD_CLASS} flex min-w-0 flex-col`}>
          <ActionForm
            action={saveWidgetAction}
            label="Save Widget"
            className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800"
          >
            {report && <input type="hidden" name="query" value={JSON.stringify(report.query)} />}
            <input type="hidden" name="visualisation" value={visualisation} />
            {widget && <input type="hidden" name="widgetId" value={widget.id} />}
            {!widget && dashboardId && (
              <input type="hidden" name="dashboardId" value={dashboardId} />
            )}
            <input
              name="name"
              required
              aria-label="Widget name"
              placeholder="Name this Widget"
              defaultValue={widget?.name ?? ''}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold placeholder:text-zinc-400 hover:border-zinc-200 focus:border-zinc-300 dark:hover:border-zinc-700 dark:focus:border-zinc-600"
            />
            <button type="submit" disabled={!report} className={PRIMARY_BUTTON_CLASS}>
              {widget ? 'Update Widget' : 'Save Widget'}
            </button>
          </ActionForm>
          <div className="flex flex-col gap-3 p-5">
            {error && <FieldError message={error} />}
            {report && (
              <WidgetView
                report={report}
                title={widget?.name ?? 'New Widget'}
                visualisation={visualisation}
                data={isBalances ? toPivotData(report, balanceHref) : undefined}
              />
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              The preview follows every change. All values in CHF. Transfers are always left out;
              Capital only when included.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

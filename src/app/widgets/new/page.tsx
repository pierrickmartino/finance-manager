import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { ACCENT_BUTTON_CLASS, CARD_CLASS, PAGE_TITLE_CLASS } from '@/components/surface';
import { timeAxisOf } from '@/lib/reporting/card';
import { EDITOR } from '@/lib/reporting/drill-origin';
import {
  balancesQueryFromParams,
  queryFromParams,
  type UrlParams,
} from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import {
  getWidget,
  VISUALISATIONS,
  type Visualisation,
  type Widget,
  type WidgetSource,
} from '@/server/services/reporting';
import { NotFoundError } from '@/server/services/errors';
import { widgetLinks } from '../../dashboards/load';
import { saveWidgetAction } from '../actions';
import { loadQueryFormLists, loadReport, loadSavedWidget } from '../load';
import { BalancesForm, SourcePicker } from '../balances-form';
import { ALWAYS_NET_WORTH, ALWAYS_SHARE, PanelSection, VisualisationPicker } from '../editor-panel';
import { QueryForm } from '../query-form';
import { WidgetView } from '../widget-view';
import { toPivotData } from '../pivot-data';
import { CardPreview } from '../card-preview';
import { PreviewTabs } from '../preview-tabs';

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

/** The editor with every field at its default, keeping the Widget or Dashboard (and source). */
function resetHref(hidden: Record<string, string>): string {
  const params = new URLSearchParams(hidden).toString();
  return params ? `/widgets/new?${params}` : '/widgets/new';
}

/** What a Widget shows: the edited Widget's source, else the `source` asked for. */
function sourceOf(widget: Widget | null, params: UrlParams): WidgetSource {
  if (widget) return widget.source;
  return param(params, 'source') === 'account_balances' ? 'account_balances' : 'query';
}

/**
 * The Widget editor: a side panel with the visualisation and the query, and next to it the
 * Widget as the card it becomes on its Dashboard's board (and the raw table behind it),
 * refreshed on every change, under the name and Save. `widget=<id>` edits that Widget (its query
 * comes in the URL like any other); `dashboard=<id>` adds the new Widget to that Dashboard, in
 * the first free spot at the bottom of its board. `source=account_balances` makes a new Widget
 * of the Account balances: a time axis and a date range make it Net worth over time.
 */
export default async function BuilderPage({ searchParams }: BuilderPageProps) {
  const params = await searchParams;
  const widget = await loadWidget(param(params, 'widget'));
  const dashboardId = widget ? widget.dashboardId : param(params, 'dashboard') || null;
  const requested = param(params, 'vis');
  const visualisation = isVisualisation(requested) ? requested : (widget?.visualisation ?? 'table');
  const source = sourceOf(widget, params);
  const isBalances = source === 'account_balances';
  const query = isBalances ? balancesQueryFromParams(params) : queryFromParams(params);
  const [{ report, error }, lists] = await Promise.all([
    isBalances ? loadSavedWidget({ source, query }) : loadReport(query),
    loadQueryFormLists(),
  ]);
  const kept: Record<string, string> = {};
  if (widget) kept.widget = widget.id;
  else if (dashboardId) kept.dashboard = dashboardId;
  const hidden = isBalances && !widget ? { ...kept, source } : kept;
  const title = widget?.name ?? 'New Widget';
  const pivot = report
    ? toPivotData(report, isBalances ? widgetLinks({ source }, report, EDITOR) : undefined)
    : null;
  const timeAxis = timeAxisOf(query);
  const backHref = dashboardId ? `/dashboards/${dashboardId}/edit` : '/widgets';
  const sourceHref = (choice: WidgetSource) =>
    resetHref(choice === 'account_balances' ? { ...kept, source: choice } : kept);

  const settingsSections = (
    <>
      {!widget && (
        <SourcePicker
          value={source}
          hrefs={{ query: sourceHref('query'), account_balances: sourceHref('account_balances') }}
        />
      )}
      <PanelSection title="Visualisation">
        <VisualisationPicker
          value={visualisation}
          alwaysShownAs={isBalances ? (timeAxis ? ALWAYS_NET_WORTH : ALWAYS_SHARE) : null}
        />
      </PanelSection>
    </>
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className={PAGE_TITLE_CLASS}>
          {widget ? `Edit Widget: ${widget.name}` : 'New Widget'}
        </h1>
        <Link href={backHref} className="text-sm underline">
          {dashboardId ? 'Back to the Dashboard' : 'All Widgets'}
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={`${CARD_CLASS} lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}
        >
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <h2 className="text-sm font-semibold">Settings</h2>
            {/* A full page load, so every field goes back to its default. */}
            <a href={resetHref(hidden)} className="text-xs text-muted hover:underline">
              Reset
            </a>
          </div>
          {isBalances ? (
            <BalancesForm
              query={query}
              accounts={lists.accounts}
              hidden={hidden}
              shownRange={report?.range}
            >
              {settingsSections}
            </BalancesForm>
          ) : (
            <QueryForm query={query} lists={lists} hidden={hidden} shownRange={report?.range}>
              {settingsSections}
            </QueryForm>
          )}
        </aside>

        <div className={`${CARD_CLASS} flex min-w-0 flex-col`}>
          <ActionForm
            action={saveWidgetAction}
            label="Save Widget"
            className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3"
          >
            {report && <input type="hidden" name="query" value={JSON.stringify(report.query)} />}
            <input type="hidden" name="visualisation" value={visualisation} />
            {widget && <input type="hidden" name="widgetId" value={widget.id} />}
            {!widget && dashboardId && (
              <input type="hidden" name="dashboardId" value={dashboardId} />
            )}
            {!widget && <input type="hidden" name="source" value={source} />}
            <input
              name="name"
              required
              aria-label="Widget name"
              placeholder="Name this Widget"
              defaultValue={widget?.name ?? ''}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-2xl tracking-tight placeholder:text-faint hover:border-rule focus:border-rule-strong"
            />
            <button type="submit" disabled={!report} className={ACCENT_BUTTON_CLASS}>
              {widget ? 'Update Widget' : 'Save Widget'}
            </button>
          </ActionForm>
          <div className="flex flex-col gap-3 p-5">
            {error && <FieldError message={error} />}
            {report && pivot && (
              <PreviewTabs
                card={
                  <CardPreview
                    layout={widget?.layout ?? null}
                    card={{
                      id: widget?.id ?? 'preview',
                      name: title,
                      source,
                      visualisation,
                      query,
                      data: pivot,
                      error: null,
                      unconvertedCount: report.unconvertedCount,
                    }}
                  />
                }
                data={<WidgetView report={report} title={title} data={pivot} />}
              />
            )}
            <p className="text-xs text-muted">
              The preview follows every change: Card shows the card this Widget becomes on a
              Dashboard, at its size there, Data the table behind it. All values in CHF. Transfers
              are always left out; Capital only when included.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

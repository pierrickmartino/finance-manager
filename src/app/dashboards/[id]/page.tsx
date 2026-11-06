import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { getServiceContext } from '@/server/app-context';
import {
  getDashboard,
  listDashboards,
  type DashboardWithWidgets,
} from '@/server/services/dashboards';
import { NotFoundError } from '@/server/services/errors';
import { listWidgets, type Widget } from '@/server/services/reporting';
import { INPUT_CLASS } from '@/components/named-list';
import { widgetPickerOptions, type WidgetPickerOption } from '@/lib/reporting/widget-picker';
import type { ServiceContext } from '@/server/services/context';
import {
  addBalancesWidgetAction,
  copyWidgetToDashboardAction,
  deleteDashboardWidgetAction,
  duplicateWidgetAction,
} from '../actions';
import { editWidgetHref, loadWidgetView } from '../load';
import { DashboardTabs } from '../tabs';
import { WidgetVisualisation } from '../widget-visualisation';
import { DashboardGrid, type GridWidget } from './dashboard-grid';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import type { ProtoWidget } from './prototype/data';
import { PROTOTYPE_VARIANTS, PrototypeVariant } from './prototype/variants';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

const LINK_BUTTON =
  'rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900';
const SMALL_ACTION = 'text-xs text-zinc-600 underline dark:text-zinc-400';
const DEFAULT_LAYOUT = { x: 0, y: 0, w: 6, h: 8 };

async function findDashboard(ctx: ServiceContext, id: string): Promise<DashboardWithWidgets> {
  try {
    return await getDashboard(ctx, id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

function WidgetHeader({ widget }: { widget: Widget }) {
  return (
    <>
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{widget.name}</h2>
      <Link
        href={editWidgetHref(widget)}
        aria-label={`Edit ${widget.name}`}
        className={SMALL_ACTION}
      >
        Edit
      </Link>
      <ActionForm
        action={duplicateWidgetAction.bind(null, widget.id)}
        label={`Duplicate ${widget.name}`}
      >
        <button type="submit" className={SMALL_ACTION}>
          Duplicate
        </button>
      </ActionForm>
      <ActionForm
        action={deleteDashboardWidgetAction.bind(null, widget.id)}
        label={`Delete ${widget.name}`}
        confirmMessage={`Delete the Widget "${widget.name}"?`}
      >
        <button type="submit" className={`${SMALL_ACTION} text-red-700 dark:text-red-400`}>
          Delete
        </button>
      </ActionForm>
    </>
  );
}

/** Places a copy of any Widget on this Dashboard (GLOSSARY: Standalone Widget). */
function AddSavedWidget({
  dashboardId,
  options,
}: {
  dashboardId: string;
  options: WidgetPickerOption[];
}) {
  if (options.length === 0) return null;
  return (
    <ActionForm
      action={copyWidgetToDashboardAction.bind(null, dashboardId)}
      label="Add existing Widget"
      className="flex items-center gap-2"
    >
      <select name="widgetId" aria-label="Widget" className={INPUT_CLASS}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit" className={LINK_BUTTON}>
        Add
      </button>
    </ActionForm>
  );
}

async function gridWidget(ctx: ServiceContext, widget: Widget): Promise<GridWidget> {
  const view = await loadWidgetView(ctx, widget);
  return {
    id: widget.id,
    title: widget.name,
    layout: widget.layout ?? DEFAULT_LAYOUT,
    header: <WidgetHeader widget={widget} />,
    body: (
      <div className="flex h-full flex-col gap-1">
        {view.error && <FieldError message={view.error} />}
        {view.unconvertedCount > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {view.unconvertedCount} left out: no FX rate yet.
          </p>
        )}
        {view.data && (
          <div className="min-h-0 flex-1">
            <WidgetVisualisation
              data={view.data}
              title={widget.name}
              visualisation={widget.visualisation}
              isCompact
            />
          </div>
        )}
      </div>
    ),
  };
}

/** PROTOTYPE (throwaway): the variants' data, read-only. See ./prototype/variants.tsx. */
async function prototypeWidgets(ctx: ServiceContext, widgets: Widget[]): Promise<ProtoWidget[]> {
  return Promise.all(
    widgets.map(async (widget) => {
      const view = await loadWidgetView(ctx, widget);
      return {
        id: widget.id,
        name: widget.name,
        source: widget.source,
        visualisation: widget.visualisation,
        data: view.data,
        error: view.error,
      };
    }),
  );
}

/** A Dashboard: its Widgets on a drag-and-drop grid (spec 104), values in CHF. */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  // PROTOTYPE (throwaway): `?variant=A…F` swaps the rendering, in every build (production too).
  const { variant } = await searchParams;
  if (typeof variant === 'string' && variant !== 'current') {
    const dashboards = await listDashboards(ctx);
    return (
      <section className="flex flex-col gap-4 pb-24">
        <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
        <PrototypeVariant
          variant={variant}
          dashboardName={dashboard.name}
          widgets={await prototypeWidgets(ctx, dashboard.widgets)}
        />
        <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} />
      </section>
    );
  }
  const [dashboards, widgets, savedWidgets] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => gridWidget(ctx, widget))),
    listWidgets(ctx),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{dashboard.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/widgets/new?dashboard=${dashboard.id}`} className={LINK_BUTTON}>
            Add Widget
          </Link>
          <ActionForm
            action={addBalancesWidgetAction.bind(null, dashboard.id)}
            label="Add Account balances"
          >
            <button type="submit" className={LINK_BUTTON}>
              Add Account balances
            </button>
          </ActionForm>
          <AddSavedWidget
            dashboardId={dashboard.id}
            options={widgetPickerOptions(savedWidgets, dashboards)}
          />
        </div>
      </div>
      {widgets.length === 0 ? (
        <p className="text-sm text-zinc-500">No Widgets yet. Add one to start.</p>
      ) : (
        <DashboardGrid
          key={widgets.map((widget) => widget.id).join()}
          dashboardId={dashboard.id}
          widgets={widgets}
        />
      )}
      <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} />
    </section>
  );
}

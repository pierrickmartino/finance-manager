import type { Metadata } from 'next';
import Link from 'next/link';
import { PILL_BUTTON_CLASS } from '@/components/surface';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { homeDashboard, listDashboards } from '@/server/services/dashboards';
import { swissToday } from '@/server/services/fx/dates';
import { findDashboard, loadNetWorthTrend, loadRecentActivity, loadWidgetCard } from '../../load';
import { DashboardTabs } from '../../tabs';
import { DashboardChrome, DashboardOverview } from './overview/dashboard-overview';
import { StreamedBoard, StreamedCompleteness, StreamedOverview } from './streamed';
import { loadProtoDashboard } from '@/server/prototype-tremor-data';
import { readVariant } from '@/server/prototype-variant';
import { DashboardA } from './prototype-tremor/dashboard-a';
import { DashboardB } from './prototype-tremor/dashboard-b';
import { DashboardC } from './prototype-tremor/dashboard-c';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/**
 * A Dashboard, read as a grid of cards: an overview row, then the board, one card per Widget at
 * its place and size (GLOSSARY: Dashboard Story, ADR-0009, ADR-0010). Values in CHF. Changing the Widgets
 * happens in Edit mode (./edit). The home Dashboard (the one the home page opens) also shows the
 * Completeness check (ADR-0008).
 *
 * The page shell (tabs, name, actions) renders as soon as the Dashboard is found; each part that
 * waits on a query streams in behind its own placeholder (./streamed).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  // PROTOTYPE (Tremor redesign): ?variant= A, B or C draws a Tremor take on the page.
  const variant = await readVariant(await searchParams);
  if (variant !== 'current') {
    const Variant = { A: DashboardA, B: DashboardB, C: DashboardC }[variant];
    return <Variant data={await loadProtoDashboard(ctx.db)} name={dashboard.name} />;
  }
  // Started now, awaited by the parts that show them: each Widget's query runs once.
  const cards = dashboard.widgets.map((widget) => ({
    widget,
    card: loadWidgetCard(ctx, widget),
  }));
  const trend = loadNetWorthTrend(ctx, dashboard.widgets);
  const recent = loadRecentActivity(ctx);
  const [dashboards, fmt] = await Promise.all([listDashboards(ctx), getFormatter()]);
  const isHome = homeDashboard(dashboards)?.id === dashboard.id;

  const editHref = `/dashboards/${dashboard.id}/edit`;

  return (
    <section className="flex flex-col gap-4">
      <DashboardChrome part="dashboard-tabs" dashboardId={dashboard.id}>
        <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      </DashboardChrome>
      <DashboardOverview
        dashboardId={dashboard.id}
        dashboardName={dashboard.name}
        subtitle={<p>Where you stand, where it went, and what changed this month.</p>}
        actions={
          <Link href={editHref} className={PILL_BUTTON_CLASS}>
            Edit Dashboard
          </Link>
        }
        isEmpty={dashboard.widgets.length === 0}
        notice={isHome && <StreamedCompleteness ctx={ctx} fmt={fmt} today={swissToday()} />}
        overview={
          <StreamedOverview cards={cards.map(({ card }) => card)} trend={trend} recent={recent} />
        }
        board={<StreamedBoard cards={cards} />}
        empty={
          <p className="py-16 text-lg text-muted">
            No Widgets yet.{' '}
            <Link href={editHref} className="text-ink underline underline-offset-4">
              Edit the Dashboard
            </Link>{' '}
            to add one.
          </p>
        }
      />
    </section>
  );
}

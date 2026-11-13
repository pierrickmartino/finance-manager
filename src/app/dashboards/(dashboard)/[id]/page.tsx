import type { Metadata } from 'next';
import Link from 'next/link';
import { PILL_BUTTON_CLASS } from '@/components/surface';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { homeDashboard, listDashboards } from '@/server/services/dashboards';
import { swissToday } from '@/server/services/fx/dates';
import { findDashboard, loadRecentActivity, loadStoryChapter } from '../../load';
import { DashboardTabs } from '../../tabs';
import { DashboardChrome, DashboardOverview } from './overview/dashboard-overview';
import { StreamedBoard, StreamedCompleteness, StreamedOverview } from './streamed';

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
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  // Started now, awaited by the parts that show them: each Widget's query runs once.
  const cards = dashboard.widgets.map((widget) => ({
    widget,
    chapter: loadStoryChapter(ctx, widget),
  }));
  const recent = loadRecentActivity(ctx);
  const [dashboards, fmt] = await Promise.all([listDashboards(ctx), getFormatter()]);
  const isHome = homeDashboard(dashboards)?.id === dashboard.id;

  const editHref = `/dashboards/${dashboard.id}/edit`;

  return (
    <section className="flex flex-col gap-4">
      <DashboardChrome name="dashboard-tabs">
        <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      </DashboardChrome>
      <DashboardOverview
        dashboardName={dashboard.name}
        subtitle={<p>Where you stand, where it went, and what changed this month.</p>}
        actions={
          <Link href={editHref} className={PILL_BUTTON_CLASS}>
            Edit Dashboard
          </Link>
        }
        isEmpty={dashboard.widgets.length === 0}
        notice={isHome && <StreamedCompleteness ctx={ctx} fmt={fmt} today={swissToday()} />}
        overview={<StreamedOverview chapters={cards.map((card) => card.chapter)} recent={recent} />}
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

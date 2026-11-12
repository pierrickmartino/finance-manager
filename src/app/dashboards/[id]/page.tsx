import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { findDashboard, loadRecentActivity, loadStoryChapter } from '../load';
import { DashboardTabs } from '../tabs';
import { DashboardOverview } from './overview/dashboard-overview';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/**
 * A Dashboard, read as a grid of cards: an overview row, then one card per Widget in the
 * Dashboard's order (GLOSSARY: Dashboard Story, ADR-0009). Values in CHF. Changing the Widgets
 * happens in Edit mode (./edit).
 */
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters, recent] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => loadStoryChapter(ctx, widget))),
    loadRecentActivity(ctx),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <DashboardOverview
        dashboardName={dashboard.name}
        editHref={`/dashboards/${dashboard.id}/edit`}
        chapters={chapters}
        recent={recent}
      />
    </section>
  );
}

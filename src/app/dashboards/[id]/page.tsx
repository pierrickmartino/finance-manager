import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { findDashboard, loadStoryChapter } from '../load';
import { DashboardTabs } from '../tabs';
import { DashboardStory } from './story/dashboard-story';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/**
 * A Dashboard, told as a Story: a hero number, then one chapter per Widget, in Story order
 * (GLOSSARY: Dashboard Story). Values in CHF. Changing the Widgets happens in Edit mode (./edit).
 */
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => loadStoryChapter(ctx, widget))),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <DashboardStory
        dashboardName={dashboard.name}
        editHref={`/dashboards/${dashboard.id}/edit`}
        chapters={chapters}
      />
    </section>
  );
}

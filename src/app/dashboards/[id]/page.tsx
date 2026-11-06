import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import type { ServiceContext } from '@/server/services/context';
import { listDashboards } from '@/server/services/dashboards';
import type { Widget, WidgetLayout } from '@/server/services/reporting';
import { findDashboard, loadWidgetView } from '../load';
import { DashboardTabs } from '../tabs';
import { DashboardStory, type StoryChapter } from './story/dashboard-story';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

const TOP_LEFT: WidgetLayout = { x: 0, y: 0, w: 0, h: 0 };

/** Grid order, top to bottom then left to right: the order the grid stacks in on a phone. */
function byLayout(a: Widget, b: Widget): number {
  const la = a.layout ?? TOP_LEFT;
  const lb = b.layout ?? TOP_LEFT;
  return la.y - lb.y || la.x - lb.x;
}

async function storyChapter(ctx: ServiceContext, widget: Widget): Promise<StoryChapter> {
  const view = await loadWidgetView(ctx, widget);
  return {
    id: widget.id,
    name: widget.name,
    source: widget.source,
    visualisation: widget.visualisation,
    data: view.data,
    error: view.error,
    unconvertedCount: view.unconvertedCount,
  };
}

/**
 * A Dashboard, told as a Story: a hero number, then one chapter per Widget (GLOSSARY:
 * Dashboard Story). Values in CHF. Changing the Widgets happens in Edit mode (./edit).
 */
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters] = await Promise.all([
    listDashboards(ctx),
    Promise.all([...dashboard.widgets].sort(byLayout).map((widget) => storyChapter(ctx, widget))),
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

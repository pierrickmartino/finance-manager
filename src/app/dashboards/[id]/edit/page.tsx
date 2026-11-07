import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { listWidgets } from '@/server/services/reporting';
import { widgetPickerOptions } from '@/lib/reporting/widget-picker';
import { editWidgetHref, findDashboard, loadStoryChapter } from '../../load';
import { DashboardTabs } from '../../tabs';
import { StoryEditor } from './story-editor';

export const metadata: Metadata = { title: 'Edit Dashboard · Finance Manager' };

/**
 * Edit mode of a Dashboard: its Story, still, with every Widget action on its chapter and a
 * place to add one between every two (ADR-0007). Values in CHF. "Done" returns to the Story.
 */
export default async function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters, savedWidgets] = await Promise.all([
    listDashboards(ctx),
    Promise.all(
      dashboard.widgets.map(async (widget) => ({
        ...(await loadStoryChapter(ctx, widget)),
        editHref: editWidgetHref(widget),
      })),
    ),
    listWidgets(ctx),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <StoryEditor
        // A new set of Widgets (added, duplicated, deleted) starts again from the server's order.
        key={chapters
          .map((chapter) => chapter.id)
          .sort()
          .join()}
        dashboardId={dashboard.id}
        dashboardName={dashboard.name}
        storyHref={`/dashboards/${dashboard.id}`}
        chapters={chapters}
        savedWidgets={widgetPickerOptions(savedWidgets, dashboards)}
      />
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCENT_BUTTON_CLASS } from '@/components/surface';
import { widgetPickerOptions } from '@/lib/reporting/widget-picker';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { listWidgets } from '@/server/services/reporting';
import { editWidgetHref, findDashboard, loadRecentActivity, loadStoryChapter } from '../../../load';
import { DashboardTabs } from '../../../tabs';
import { DashboardChrome, DashboardOverview, OverviewCards } from '../overview/dashboard-overview';
import { AddWidgetMenu, EmptyBoard } from './add-widget';
import { EditBoard } from './edit-board';

export const metadata: Metadata = { title: 'Edit Dashboard · Finance Manager' };

/**
 * Edit mode of a Dashboard: its Story's own grid, edited in place (GLOSSARY: Edit mode,
 * ADR-0010). The overview row stays fixed above the board; each card carries its actions, and
 * Add Widget is in the header. Values in CHF. "Done" returns to the Story.
 */
export default async function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters, recent, savedWidgets] = await Promise.all([
    listDashboards(ctx),
    Promise.all(
      dashboard.widgets.map(async (widget) => ({
        ...(await loadStoryChapter(ctx, widget)),
        editHref: editWidgetHref(widget),
      })),
    ),
    loadRecentActivity(ctx),
    listWidgets(ctx),
  ]);
  const choices = {
    dashboardId: dashboard.id,
    savedWidgets: widgetPickerOptions(savedWidgets, dashboards),
  };

  return (
    <section className="flex flex-col gap-4">
      <DashboardChrome part="dashboard-tabs" dashboardId={dashboard.id}>
        <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      </DashboardChrome>
      <DashboardOverview
        dashboardId={dashboard.id}
        dashboardName={dashboard.name}
        subtitle={<p>Editing</p>}
        actions={
          <>
            {chapters.length > 0 && <AddWidgetMenu {...choices} />}
            <Link href={`/dashboards/${dashboard.id}`} className={ACCENT_BUTTON_CLASS}>
              Done
            </Link>
          </>
        }
        isEmpty={chapters.length === 0}
        overview={<OverviewCards chapters={chapters} recent={recent} />}
        board={
          <EditBoard
            // A new set of Widgets (added, duplicated, removed) starts again from the server's board.
            key={chapters
              .map((chapter) => chapter.id)
              .sort()
              .join()}
            dashboardId={dashboard.id}
            chapters={chapters}
          />
        }
        empty={<EmptyBoard {...choices} />}
      />
    </section>
  );
}

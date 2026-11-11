import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { checkCompleteness, type CompletenessEntry } from '@/server/services/completeness';
import { homeDashboard, listDashboards } from '@/server/services/dashboards';
import { swissToday } from '@/server/services/fx/dates';
import { findDashboard, loadStoryChapter } from '../load';
import { DashboardTabs } from '../tabs';
import { CompletenessNotice } from './completeness-notice';
import { DashboardStory } from './story/dashboard-story';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/**
 * A Dashboard, told as a Story: a hero number, then one chapter per Widget, in Story order
 * (GLOSSARY: Dashboard Story). Values in CHF. Changing the Widgets happens in Edit mode (./edit).
 * The home Dashboard (the one the home page opens) also shows the Completeness check (ADR-0008).
 */
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters, fmt] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => loadStoryChapter(ctx, widget))),
    getFormatter(),
  ]);
  const completeness: CompletenessEntry[] | null =
    homeDashboard(dashboards)?.id === dashboard.id
      ? await checkCompleteness(ctx, { today: swissToday() })
      : null;

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <DashboardStory
        dashboardName={dashboard.name}
        editHref={`/dashboards/${dashboard.id}/edit`}
        chapters={chapters}
        notice={completeness && <CompletenessNotice entries={completeness} fmt={fmt} />}
      />
    </section>
  );
}

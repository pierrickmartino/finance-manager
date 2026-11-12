import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { checkCompleteness, type CompletenessEntry } from '@/server/services/completeness';
import { homeDashboard, listDashboards } from '@/server/services/dashboards';
import { swissToday } from '@/server/services/fx/dates';
import { findDashboard, loadRecentActivity, loadStoryChapter } from '../load';
import { VariantDashboard } from '../../prototype-layout/dashboards';
import { parseVariant } from '../../prototype-layout/variant';
import { DashboardTabs } from '../tabs';
import { CompletenessNotice } from './completeness-notice';
import { DashboardOverview } from './overview/dashboard-overview';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/**
 * A Dashboard, read as a grid of cards: an overview row, then one card per Widget in the
 * Dashboard's order (GLOSSARY: Dashboard Story, ADR-0009). Values in CHF. Changing the Widgets
 * happens in Edit mode (./edit). The home Dashboard (the one the home page opens) also shows the
 * Completeness check (ADR-0008).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  // PROTOTYPE (layout redesign): `?variant=A|B|C` renders a variant layout. Throwaway.
  const variant = parseVariant((await searchParams).variant);
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters, recent, fmt] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => loadStoryChapter(ctx, widget))),
    loadRecentActivity(ctx),
    getFormatter(),
  ]);
  const completeness: CompletenessEntry[] | null =
    homeDashboard(dashboards)?.id === dashboard.id
      ? await checkCompleteness(ctx, { today: swissToday() })
      : null;

  const notice = completeness && <CompletenessNotice entries={completeness} fmt={fmt} />;
  if (variant !== 'current') {
    return (
      <VariantDashboard
        variant={variant}
        dashboardName={dashboard.name}
        editHref={`/dashboards/${dashboard.id}/edit`}
        chapters={chapters}
        recent={recent}
        notice={notice}
        tabs={
          <DashboardTabs
            dashboards={dashboards}
            currentId={dashboard.id}
            query={`?variant=${variant}`}
          />
        }
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <DashboardOverview
        dashboardName={dashboard.name}
        editHref={`/dashboards/${dashboard.id}/edit`}
        chapters={chapters}
        recent={recent}
        notice={notice}
      />
    </section>
  );
}

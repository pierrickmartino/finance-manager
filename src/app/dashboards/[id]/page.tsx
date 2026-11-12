import type { Metadata } from 'next';
import Link from 'next/link';
import { PILL_BUTTON_CLASS } from '@/components/surface';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { checkCompleteness, type CompletenessEntry } from '@/server/services/completeness';
import { homeDashboard, listDashboards } from '@/server/services/dashboards';
import { swissToday } from '@/server/services/fx/dates';
import { findDashboard, loadRecentActivity, loadStoryChapter } from '../load';
import { DashboardTabs } from '../tabs';
import { AttentionPrototype, IS_PROTOTYPE_ENABLED } from './attention-prototype';
import { CompletenessNotice } from './completeness-notice';
import { DashboardOverview } from './overview/dashboard-overview';
import { WidgetBoard } from './overview/widget-board';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/**
 * A Dashboard, read as a grid of cards: an overview row, then the board, one card per Widget at
 * its place and size (GLOSSARY: Dashboard Story, ADR-0009, ADR-0010). Values in CHF. Changing the Widgets
 * happens in Edit mode (./edit). The home Dashboard (the one the home page opens) also shows the
 * Completeness check (ADR-0008).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // PROTOTYPE: ?variant= and ?sample= for ./attention-prototype.
  searchParams: Promise<{ variant?: string; sample?: string }>;
}) {
  const { variant, sample } = await searchParams;
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

  const editHref = `/dashboards/${dashboard.id}/edit`;

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <DashboardOverview
        dashboardName={dashboard.name}
        subtitle={<p>Where you stand, where it went, and what changed this month.</p>}
        actions={
          <Link href={editHref} className={PILL_BUTTON_CLASS}>
            Edit Dashboard
          </Link>
        }
        chapters={chapters}
        recent={recent}
        notice={
          completeness &&
          (IS_PROTOTYPE_ENABLED ? (
            <AttentionPrototype
              realEntries={completeness}
              variant={variant}
              sample={sample}
              fmt={fmt}
              today={swissToday()}
            />
          ) : (
            <CompletenessNotice entries={completeness} fmt={fmt} />
          ))
        }
        board={<WidgetBoard chapters={chapters} />}
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

import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { listTransactions } from '@/server/services/transactions';
import { findDashboard, loadStoryChapter } from '../load';
import { DashboardTabs } from '../tabs';
import { BaselineSwitcher, DashboardVariants } from './prototype/dashboard-variants';
import { DashboardStory } from './story/dashboard-story';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/** PROTOTYPE: `?variant=B|C|D` renders a redesign (./prototype); never in production. */
const PROTOTYPE_VARIANTS = new Set(['B', 'C', 'D']);

/**
 * A Dashboard, told as a Story: a hero number, then one chapter per Widget, in Story order
 * (GLOSSARY: Dashboard Story). Values in CHF. Changing the Widgets happens in Edit mode (./edit).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const ctx = await getServiceContext();
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => loadStoryChapter(ctx, widget))),
  ]);
  const editHref = `/dashboards/${dashboard.id}/edit`;

  // PROTOTYPE ------------------------------------------------------------------------------
  const isPrototypeOn = process.env.NODE_ENV !== 'production';
  const variant = (await searchParams).variant ?? 'A';
  if (isPrototypeOn && PROTOTYPE_VARIANTS.has(variant)) {
    const { transactions } = await listTransactions(ctx, { pageSize: 12 });
    const activity = transactions.map((t) => ({
      id: t.id,
      name: t.payee?.name ?? t.counterpartyName ?? t.rawDescription,
      detail: t.category?.name ?? t.accountName,
      bookingDate: t.bookingDate,
      amountMinor: t.amountMinor,
      currency: t.currency,
    }));
    return (
      <section className="flex flex-col gap-4">
        <DashboardVariants
          variant={variant}
          chapters={chapters}
          dashboard={{ id: dashboard.id, name: dashboard.name }}
          dashboards={dashboards}
          activity={activity}
          editHref={editHref}
        />
      </section>
    );
  }
  // ----------------------------------------------------------------------------------------

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      <DashboardStory dashboardName={dashboard.name} editHref={editHref} chapters={chapters} />
      {isPrototypeOn && <BaselineSwitcher />}
    </section>
  );
}

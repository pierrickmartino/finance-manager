import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listDashboards } from '@/server/services/dashboards';
import { listTransactions } from '@/server/services/transactions';
import { categoryText, transactionName } from '../../transactions/transaction-display';
import { findDashboard, loadStoryChapter } from '../load';
import { DashboardTabs } from '../tabs';
import { PrototypeBento } from './prototype-bento';
import { PrototypeFocus } from './prototype-focus';
import type { RecentTransaction } from './prototype-recent';
import { PrototypeSwitcher } from './prototype-switcher';
import { parseVariant } from './prototype-variants';
import { DashboardStory } from './story/dashboard-story';

export const metadata: Metadata = { title: 'Dashboard · Finance Manager' };

/** PROTOTYPE — throwaway: the latest Transactions, for the B and C variants. */
async function loadRecent(
  ctx: Awaited<ReturnType<typeof getServiceContext>>,
): Promise<RecentTransaction[]> {
  const page = await listTransactions(ctx, { pageSize: 6 });
  return page.transactions.map((t) => ({
    id: t.id,
    name: transactionName(t),
    category: categoryText(t),
    bookingDate: t.bookingDate,
    amountMinor: t.amountMinor,
    currency: t.currency,
  }));
}

/**
 * A Dashboard, told as a Story: a hero number, then one chapter per Widget, in Story order
 * (GLOSSARY: Dashboard Story). Values in CHF. Changing the Widgets happens in Edit mode (./edit).
 *
 * PROTOTYPE: `?variant=B|C` swaps the rendering for a redesign candidate (prototype-variants.ts).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getServiceContext();
  const variant = parseVariant((await searchParams).variant);
  const dashboard = await findDashboard(ctx, (await params).id);
  const [dashboards, chapters, recent] = await Promise.all([
    listDashboards(ctx),
    Promise.all(dashboard.widgets.map((widget) => loadStoryChapter(ctx, widget))),
    variant === 'A' ? Promise.resolve([]) : loadRecent(ctx),
  ]);
  const props = {
    dashboardName: dashboard.name,
    editHref: `/dashboards/${dashboard.id}/edit`,
    chapters,
    recent,
  };

  return (
    <section className="flex flex-col gap-4">
      <DashboardTabs dashboards={dashboards} currentId={dashboard.id} />
      {variant === 'A' && <DashboardStory {...props} />}
      {variant === 'B' && <PrototypeBento {...props} />}
      {variant === 'C' && <PrototypeFocus {...props} />}
      <PrototypeSwitcher current={variant} />
    </section>
  );
}

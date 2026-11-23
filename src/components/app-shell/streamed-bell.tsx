import { Suspense } from 'react';
import { getServiceContext } from '@/server/app-context';
import { listAttentionItems } from '@/server/services/attention';
import { swissToday } from '@/server/services/fx/dates';
import { BellOpenProvider } from './bell-open';
import { NotificationsBell } from './notifications-bell';

async function BellWithItems() {
  const ctx = await getServiceContext();
  const items = await listAttentionItems(ctx, { today: swissToday() });
  return <NotificationsBell items={items} />;
}

/**
 * The notifications bell, its Attention items worked out on every render (ADR-0019) and streamed
 * in, so the page never waits on them: until then the bell shows them loading.
 */
export function StreamedBell() {
  return (
    <BellOpenProvider>
      <Suspense fallback={<NotificationsBell items={null} />}>
        <BellWithItems />
      </Suspense>
    </BellOpenProvider>
  );
}

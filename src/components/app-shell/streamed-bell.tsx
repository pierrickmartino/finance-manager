import { getServiceContext } from '@/server/app-context';
import { listAttentionItems } from '@/server/services/attention';
import { swissToday } from '@/server/services/fx/dates';
import { NotificationsBell } from './notifications-bell';

/**
 * The notifications bell, its Attention items worked out on every render (ADR-0019) and streamed
 * in, so the page never waits on them. The items are started here, not awaited: the bell's button
 * renders and hydrates with the shell, and only its dot and list wait for them.
 */
export function StreamedBell() {
  const items = getServiceContext().then((ctx) => listAttentionItems(ctx, { today: swissToday() }));
  return <NotificationsBell items={items} />;
}

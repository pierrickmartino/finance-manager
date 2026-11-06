import Link from 'next/link';
import type { Dashboard } from '@/server/services/dashboards';

/** Every Dashboard, in the user's order, plus the page that manages them. */
export function DashboardTabs({
  dashboards,
  currentId,
}: {
  dashboards: Dashboard[];
  currentId: string | null;
}) {
  return (
    <nav
      aria-label="Dashboards"
      className="flex flex-wrap items-center gap-1 border-b border-rule pb-2 text-sm"
    >
      {dashboards.map((dashboard) => (
        <Link
          key={dashboard.id}
          href={`/dashboards/${dashboard.id}`}
          aria-current={dashboard.id === currentId ? 'page' : undefined}
          className={`rounded-md px-3 py-1 ${
            dashboard.id === currentId ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sunken'
          }`}
        >
          {dashboard.name}
        </Link>
      ))}
      <Link
        href="/dashboards"
        aria-current={currentId === null ? 'page' : undefined}
        className="ml-auto px-3 py-1 text-ink-soft underline"
      >
        Manage Dashboards
      </Link>
    </nav>
  );
}

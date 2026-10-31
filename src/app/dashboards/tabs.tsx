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
      className="flex flex-wrap items-center gap-1 border-b border-zinc-200 pb-2 text-sm dark:border-zinc-800"
    >
      {dashboards.map((dashboard) => (
        <Link
          key={dashboard.id}
          href={`/dashboards/${dashboard.id}`}
          aria-current={dashboard.id === currentId ? 'page' : undefined}
          className={`rounded-md px-3 py-1 ${
            dashboard.id === currentId
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
          }`}
        >
          {dashboard.name}
        </Link>
      ))}
      <Link
        href="/dashboards"
        aria-current={currentId === null ? 'page' : undefined}
        className="ml-auto px-3 py-1 text-zinc-600 underline dark:text-zinc-400"
      >
        Manage Dashboards
      </Link>
    </nav>
  );
}

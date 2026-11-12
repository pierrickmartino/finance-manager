import Link from 'next/link';
import { PILL_BUTTON_CLASS } from '@/components/surface';
import type { StoryChapter } from '../story/chapter';
import { InsightCard, NetWorthCard, RecentActivityCard, type RecentActivity } from './overview-row';
import { WidgetCard } from './widget-card';

interface DashboardOverviewProps {
  dashboardName: string;
  editHref: string;
  chapters: StoryChapter[];
  recent: RecentActivity[];
}

/**
 * The Dashboard read as a grid of cards (GLOSSARY: Dashboard Story, ADR-0009): an overview row
 * (the headline number, the month's insight, recent activity), then one card per Widget in the
 * Dashboard's order, left to right and top to bottom. Light only; values in CHF.
 */
export function DashboardOverview({
  dashboardName,
  editHref,
  chapters,
  recent,
}: DashboardOverviewProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{dashboardName}</h1>
          <p className="mt-1 text-muted">
            Where you stand, where it went, and what changed this month.
          </p>
        </div>
        <Link href={editHref} className={PILL_BUTTON_CLASS}>
          Edit Dashboard
        </Link>
      </header>
      {chapters.length === 0 ? (
        <p className="py-16 text-lg text-muted">
          No Widgets yet.{' '}
          <Link href={editHref} className="text-ink underline underline-offset-4">
            Edit the Dashboard
          </Link>{' '}
          to add one.
        </p>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
          <NetWorthCard chapters={chapters} />
          <InsightCard chapters={chapters} />
          <RecentActivityCard recent={recent} />
          {chapters.map((chapter) => (
            <WidgetCard key={chapter.id} chapter={chapter} />
          ))}
        </div>
      )}
    </div>
  );
}

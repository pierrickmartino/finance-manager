import type { ReactNode } from 'react';
import { InsightCard, NetWorthCard, RecentActivityCard, type RecentActivity } from './overview-row';
import type { StoryChapter } from '../story/chapter';

interface DashboardOverviewProps {
  dashboardName: string;
  /** Under the name: what the Dashboard tells, or that it's being edited. */
  subtitle: ReactNode;
  /** Beside the name: Edit Dashboard, or Edit mode's Add Widget and Done. */
  actions: ReactNode;
  /** Whether the Dashboard has no Widgets: known from the Dashboard itself, before any query. */
  isEmpty: boolean;
  /**
   * Shown between the title and the grid, outside the Story itself: the home Dashboard's
   * Completeness check (ADR-0008). A server component, so it stays server-rendered.
   */
  notice?: ReactNode;
  /** The overview row's cards: drawn as they are (`OverviewCards`), or streamed in by the Story. */
  overview: ReactNode;
  /** The Widgets' board: drawn as it is, streamed in card by card, or Edit mode's (ADR-0010). */
  board: ReactNode;
  /** What a Dashboard without Widgets shows instead of the overview row and the board. */
  empty: ReactNode;
}

/**
 * The Dashboard read as a grid of cards (GLOSSARY: Dashboard Story, ADR-0009): an overview row
 * (the headline number, the month's insight, recent activity) in its own band, then the board,
 * each Widget's card at its place and size (ADR-0010). Edit mode draws the same page with its
 * own controls. Light only; values in CHF.
 */
export function DashboardOverview({
  dashboardName,
  subtitle,
  actions,
  isEmpty,
  notice,
  overview,
  board,
  empty,
}: DashboardOverviewProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{dashboardName}</h1>
          <div className="mt-1 text-muted">{subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </header>
      {notice}
      {isEmpty ? (
        empty
      ) : (
        <>
          <OverviewRow>{overview}</OverviewRow>
          {board}
        </>
      )}
    </div>
  );
}

/** The overview row's band: its cards side by side from `md` up. */
export function OverviewRow({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

/** The overview row's cards, every chapter already loaded: net worth, insight, recent activity. */
export function OverviewCards({
  chapters,
  recent,
}: {
  /** In reading order. */
  chapters: StoryChapter[];
  recent: RecentActivity[];
}) {
  return (
    <>
      <NetWorthCard chapters={chapters} />
      <InsightCard chapters={chapters} />
      <RecentActivityCard recent={recent} />
    </>
  );
}

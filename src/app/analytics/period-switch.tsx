import Link from 'next/link';
import { CHOICE_TILE_CLASS } from '@/components/surface';
import {
  analyticsHref,
  PERIOD_VIEW_LABELS,
  PERIOD_VIEWS,
  type PeriodView,
} from '@/lib/analytics/period-view';

/**
 * The Period view switch (GLOSSARY: Period view): one plain link per view, the current one
 * marked `aria-current`. It sticks to the top of the screen as the page scrolls, so the view can
 * change from anywhere on the page.
 */
export function PeriodSwitch({ view }: { view: PeriodView }) {
  return (
    <nav
      aria-label="Period view"
      data-testid="period-switch"
      className="sticky top-0 z-10 -mx-1 flex gap-2 bg-paper px-1 py-2"
    >
      {PERIOD_VIEWS.map((option) => (
        <Link
          key={option}
          href={analyticsHref(option)}
          aria-current={option === view ? 'page' : undefined}
          className={`${CHOICE_TILE_CLASS} px-4 py-1.5 text-sm font-medium`}
        >
          {PERIOD_VIEW_LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}

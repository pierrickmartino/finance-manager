'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { TILE_CLASS } from '@/components/surface';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { monthFlows, periodValues } from '@/lib/reporting/overview';
import { chapterKind, chapterStory, rankedTotals, shareParts } from '@/lib/reporting/story';
import type { StoryChapter } from '../story/chapter';
import { DotMatrix, MonthBars, TickList, type TickItem } from './marks';

/** How many parts a ranking card lists. */
const RANKING_LIMIT = 6;

type Money = (minor: number) => string;

function rankingItems(data: ChartSource, money: Money): TickItem[] {
  const parts = rankedTotals(data, RANKING_LIMIT);
  const whole = Math.abs(data.total ?? 0) || parts.reduce((t, p) => t + Math.abs(p.value), 0);
  return parts.map((part) => ({
    key: `${part.group}/${part.name}`,
    title: part.name,
    detail: part.group === part.name ? money(part.value) : `${part.group} · ${money(part.value)}`,
    share: whole === 0 ? 0 : Math.abs(part.value) / whole,
    href: part.href,
  }));
}

function shareItems(data: ChartSource, money: Money): TickItem[] {
  return shareParts(data).map((part) => ({
    key: part.label,
    title: part.label,
    detail: money(part.value),
    share: part.share,
    href: part.href,
  }));
}

/** The mark that suits the Widget: dots for in and out, bars per period, ticks for parts. */
function CardBody({ chapter, money }: { chapter: StoryChapter; money: Money }) {
  const { data } = chapter;
  if (!data) return null;
  if (data.rows.length === 0) return <p className="text-muted">No data in this date range yet.</p>;
  switch (chapterKind(chapter)) {
    case 'number':
      return data.total === null ? (
        <p className="font-display text-5xl text-muted">—</p>
      ) : (
        <Link
          href={data.hrefs.total}
          className="font-display text-5xl tabular-nums hover:underline"
        >
          {money(data.total)}
        </Link>
      );
    case 'share':
      return <TickList items={shareItems(data, money)} />;
    case 'ranking':
      return <TickList items={rankingItems(data, money)} />;
    case 'trend':
    case 'bars': {
      const months = monthFlows(data);
      return months ? <DotMatrix months={months} /> : <MonthBars periods={periodValues(data)} />;
    }
  }
}

interface WidgetCardProps {
  chapter: StoryChapter;
  className?: string;
  /** Edit mode's actions on this Widget, at the top of its card. */
  toolbar?: ReactNode;
}

/**
 * One Widget as a card of the Dashboard's grid: its name, a sentence saying what its chart
 * shows, the chart, and the facts behind it (GLOSSARY: Dashboard Story).
 */
export function WidgetCard({ chapter, className = '', toolbar }: WidgetCardProps) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const story = chapterStory(chapter, money);
  return (
    <section
      aria-labelledby={`chapter-${chapter.id}`}
      className={`${TILE_CLASS} flex flex-col gap-4 ${className}`}
    >
      {toolbar}
      <div>
        <h2 id={`chapter-${chapter.id}`} className="font-medium">
          {chapter.name}
        </h2>
        {story.lead && (
          <>
            <p className="mt-1 text-sm text-muted">{story.lead.headline}</p>
            <p className="font-display text-3xl tracking-tight tabular-nums">{story.lead.detail}</p>
          </>
        )}
      </div>
      {chapter.error && <FieldError message={chapter.error} />}
      {chapter.unconvertedCount > 0 && (
        <p className="text-sm text-warning">{chapter.unconvertedCount} left out: no FX rate yet.</p>
      )}
      <CardBody chapter={chapter} money={money} />
      {story.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 border-t border-rule pt-3">
          {story.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="text-sm tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

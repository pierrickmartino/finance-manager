'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { chapterKind, chapterStory, type StoryWidget } from '@/lib/reporting/story';
import { PeriodBars, RankedBars, ShareBand, TrendChart } from './chapter-charts';
import { STORY } from './palette';
import { useIsStill } from './stillness';

export interface StoryChapter extends StoryWidget {
  error: string | null;
  /** Transactions (or Accounts) left out for want of an FX rate. */
  unconvertedCount: number;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function ChapterBody({ chapter }: { chapter: StoryChapter }) {
  const fmt = useFormatter();
  const { data } = chapter;
  if (!data) return null;
  if (data.rows.length === 0)
    return <p style={{ color: STORY.muted }}>No data in this date range yet.</p>;
  switch (chapterKind(chapter)) {
    case 'number':
      return data.total === null ? (
        <p className="font-display text-6xl" style={{ color: STORY.muted }}>
          —
        </p>
      ) : (
        <Link
          href={data.hrefs.total}
          className="font-display text-6xl tabular-nums hover:underline"
        >
          {fmt.amount(data.total, { currency: 'CHF', isWhole: true })}
        </Link>
      );
    case 'share':
      return <ShareBand data={data} title={chapter.name} />;
    case 'ranking':
      return <RankedBars data={data} title={chapter.name} />;
    case 'trend':
      return <TrendChart data={data} title={chapter.name} />;
    case 'bars':
      return <PeriodBars data={data} title={chapter.name} />;
  }
}

interface ChapterProps {
  chapter: StoryChapter;
  /** Its place in the Story, from 0: numbers the chapter and mirrors every other one. */
  index: number;
  /** Ends the chapter without its top rule (when something above already draws one). */
  isUnruled?: boolean;
}

/**
 * One Widget as a chapter: its number, a plain-language headline and its chart. It rises into
 * view as it scrolls in, unless the Story is still (Edit mode, the Widget editor's preview).
 */
export function Chapter({ chapter, index, isUnruled = false }: ChapterProps) {
  const fmt = useFormatter();
  const isStill = useIsStill();
  const story = chapterStory(chapter, (minor) =>
    fmt.amount(minor, { currency: 'CHF', isWhole: true }),
  );
  const isMirrored = index % 2 === 1;
  return (
    <motion.section
      aria-labelledby={`chapter-${chapter.id}`}
      initial={isStill ? false : { opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: EASE_OUT }}
      className={`grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] ${isUnruled ? 'pt-8 pb-16 lg:pb-20' : 'border-t py-16 lg:py-20'}`}
      style={{ borderColor: STORY.rule }}
    >
      <div className={isMirrored ? 'lg:order-2' : ''}>
        <div className="flex items-baseline gap-4">
          <span
            className="font-display text-6xl leading-none italic"
            style={{ color: STORY.accent }}
          >
            {index + 1}
          </span>
          <h2 id={`chapter-${chapter.id}`} className="text-lg font-medium">
            {chapter.name}
          </h2>
        </div>
        {chapter.error && <FieldError message={chapter.error} />}
        {chapter.unconvertedCount > 0 && (
          <p className="mt-3 text-sm text-warning">
            {chapter.unconvertedCount} left out: no FX rate yet.
          </p>
        )}
        {story.lead && (
          <p className="mt-6 font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">
            {story.lead.headline}
            <span className="mt-2 block" style={{ color: STORY.accent }}>
              {story.lead.detail}
            </span>
          </p>
        )}
        {story.facts.length > 0 && (
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4">
            {story.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-sm" style={{ color: STORY.muted }}>
                  {fact.label}
                </dt>
                <dd className="text-lg tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {chapter.data && (
          <Link
            href={chapter.data.hrefs.total}
            className="mt-8 inline-block text-sm underline underline-offset-4"
          >
            {chapter.source === 'account_balances' ? 'See the Accounts' : 'See the Transactions'}
          </Link>
        )}
      </div>
      <div className={`self-center ${isMirrored ? 'lg:order-1' : ''}`}>
        <ChapterBody chapter={chapter} />
      </div>
    </motion.section>
  );
}

'use client';

import { motion, MotionConfig, useScroll, useSpring, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import {
  chapterKind,
  chapterStory,
  storyHero,
  type StoryHero,
  type StoryWidget,
} from '@/lib/reporting/story';
import { PeriodBars, RankedBars, ShareBand, TrendChart } from './chapter-charts';
import { CountUp } from './count-up';
import { STORY } from './palette';

export interface StoryChapter extends StoryWidget {
  error: string | null;
  /** Transactions (or Accounts) left out for want of an FX rate. */
  unconvertedCount: number;
}

interface DashboardStoryProps {
  dashboardName: string;
  editHref: string;
  chapters: StoryChapter[];
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function Hero({ hero }: { hero: StoryHero }) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  return (
    <motion.div
      ref={ref}
      style={{ y, opacity }}
      className="flex min-h-[64vh] flex-col justify-center py-12"
    >
      <p className="text-lg" style={{ color: STORY.muted }}>
        {hero.label}
      </p>
      <Link
        href={hero.href}
        className="mt-2 font-serif text-[clamp(3.25rem,10vw,9rem)] leading-[0.9] tracking-[-0.04em] tabular-nums"
      >
        <CountUp value={hero.value} />
      </Link>
      <motion.div
        aria-hidden
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.4, delay: 0.6, ease: EASE_OUT }}
        className="mt-4 h-1.5 w-48 origin-left rounded-full"
        style={{ background: STORY.accent }}
      />
      {hero.flow && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mt-8 max-w-3xl font-serif text-2xl leading-snug md:text-3xl"
        >
          You brought in <b>{money(hero.flow.income)}</b>, spent <b>{money(hero.flow.expense)}</b>,
          and kept{' '}
          <span className="rounded px-1.5" style={{ background: STORY.accent, color: STORY.paper }}>
            {Math.round(hero.flow.keptShare * 100)}%
          </span>{' '}
          of it.
        </motion.p>
      )}
    </motion.div>
  );
}

function ChapterBody({ chapter }: { chapter: StoryChapter }) {
  const fmt = useFormatter();
  const { data } = chapter;
  if (!data) return null;
  if (data.rows.length === 0)
    return <p style={{ color: STORY.muted }}>No data in this date range yet.</p>;
  switch (chapterKind(chapter)) {
    case 'number':
      return data.total === null ? (
        <p className="font-serif text-6xl" style={{ color: STORY.muted }}>
          —
        </p>
      ) : (
        <Link href={data.hrefs.total} className="font-serif text-6xl tabular-nums hover:underline">
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

/** One Widget as a chapter: its number, a plain-language headline and its chart. */
function Chapter({ chapter, index }: { chapter: StoryChapter; index: number }) {
  const fmt = useFormatter();
  const story = chapterStory(chapter, (minor) =>
    fmt.amount(minor, { currency: 'CHF', isWhole: true }),
  );
  const isMirrored = index % 2 === 1;
  return (
    <motion.section
      aria-labelledby={`chapter-${chapter.id}`}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: EASE_OUT }}
      className="grid gap-10 border-t py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-20"
      style={{ borderColor: STORY.rule }}
    >
      <div className={isMirrored ? 'lg:order-2' : ''}>
        <div className="flex items-baseline gap-4">
          <span className="font-serif text-6xl leading-none italic" style={{ color: STORY.accent }}>
            {index + 1}
          </span>
          <h2 id={`chapter-${chapter.id}`} className="text-lg font-medium">
            {chapter.name}
          </h2>
        </div>
        {chapter.error && <FieldError message={chapter.error} />}
        {chapter.unconvertedCount > 0 && (
          <p className="mt-3 text-sm text-amber-700">
            {chapter.unconvertedCount} left out: no FX rate yet.
          </p>
        )}
        {story.lead && (
          <p className="mt-6 font-serif text-4xl leading-[1.05] tracking-tight md:text-5xl">
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

/**
 * The Dashboard as a Story: a hero number, then one chapter per Widget in layout order, each
 * revealed as it scrolls into view. Light only. Editing happens in the grid (Edit Dashboard).
 */
export function DashboardStory({ dashboardName, editHref, chapters }: DashboardStoryProps) {
  const hero = storyHero(chapters);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <MotionConfig reducedMotion="user">
      <div
        className="px-1 md:px-2"
        style={{ background: STORY.paper, color: STORY.ink, colorScheme: 'light' }}
      >
        <motion.div
          aria-hidden
          className="fixed inset-x-0 top-0 z-50 h-1 origin-left"
          style={{ scaleX: progress, background: STORY.accent }}
        />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl tracking-tight">{dashboardName}</h1>
          <Link
            href={editHref}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-white"
            style={{ borderColor: STORY.rule }}
          >
            Edit Dashboard
          </Link>
        </header>
        {chapters.length === 0 ? (
          <p className="py-16 text-lg" style={{ color: STORY.muted }}>
            No Widgets yet.{' '}
            <Link
              href={editHref}
              className="underline underline-offset-4"
              style={{ color: STORY.ink }}
            >
              Edit the Dashboard
            </Link>{' '}
            to add one.
          </p>
        ) : (
          <>
            {hero && <Hero hero={hero} />}
            {chapters.map((chapter, index) => (
              <Chapter key={chapter.id} chapter={chapter} index={index} />
            ))}
          </>
        )}
      </div>
    </MotionConfig>
  );
}

'use client';

import { motion, MotionConfig, useScroll, useSpring } from 'motion/react';
import Link from 'next/link';
import { storyHero } from '@/lib/reporting/story';
import { Chapter, type StoryChapter } from './chapter';
import { Hero } from './hero';
import { STORY } from './palette';

export type { StoryChapter } from './chapter';

interface DashboardStoryProps {
  dashboardName: string;
  editHref: string;
  chapters: StoryChapter[];
}

/**
 * The Dashboard as a Story: a hero number, then one chapter per Widget in Story order, each
 * revealed as it scrolls into view. Light only. Edit mode shows the same Story, still (./edit).
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
          <h1 className="font-display text-3xl tracking-tight">{dashboardName}</h1>
          <Link
            href={editHref}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-surface"
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

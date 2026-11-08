'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import type { StoryHero } from '@/lib/reporting/story';
import { CountUp } from './count-up';
import { STORY } from './palette';
import { INSTANT, useIsStill } from './stillness';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * The Story's opening number and its year in and out. It counts up and drifts away as the page
 * scrolls; when the Story is still (Edit mode) it is drawn at rest, and less tall.
 */
export function Hero({ hero }: { hero: StoryHero }) {
  const fmt = useFormatter();
  const isStill = useIsStill();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  return (
    <motion.div
      ref={ref}
      style={isStill ? undefined : { y, opacity }}
      className={`flex flex-col justify-center ${isStill ? 'py-10' : 'min-h-[64vh] py-12'}`}
    >
      <p className="text-lg" style={{ color: STORY.muted }}>
        {hero.label}
      </p>
      <Link
        href={hero.href}
        className="mt-2 font-display text-[clamp(3.25rem,10vw,9rem)] leading-[0.9] tracking-[-0.04em] tabular-nums"
      >
        {isStill ? money(hero.value) : <CountUp value={hero.value} />}
      </Link>
      <motion.div
        aria-hidden
        initial={isStill ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={isStill ? INSTANT : { duration: 1.4, delay: 0.6, ease: EASE_OUT }}
        className="mt-4 h-1.5 w-48 origin-left rounded-full"
        style={{ background: STORY.accent }}
      />
      {hero.flow && (
        <motion.p
          initial={isStill ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={isStill ? INSTANT : { duration: 1, delay: 0.9 }}
          className="mt-8 max-w-3xl font-display text-2xl leading-snug md:text-3xl"
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

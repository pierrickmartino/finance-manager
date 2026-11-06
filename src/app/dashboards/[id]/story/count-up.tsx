'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { useFormatter } from '@/components/formatter-provider';

const DURATION_S = 1.6;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * A CHF amount (minor units) that counts up from zero, formatted with the user's number
 * format on every frame. Screen readers get the final amount only.
 */
export function CountUp({ value }: { value: number }) {
  const fmt = useFormatter();
  const isReduced = useReducedMotion();
  const shown = useMotionValue(isReduced ? value : 0);
  const text = useTransform(shown, (minor) =>
    fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true }),
  );

  useEffect(() => {
    if (isReduced) {
      shown.set(value);
      return;
    }
    const controls = animate(shown, value, { duration: DURATION_S, ease: EASE_OUT });
    return () => controls.stop();
  }, [isReduced, shown, value]);

  return (
    <span aria-label={fmt.amount(value, { currency: 'CHF', isWhole: true })}>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

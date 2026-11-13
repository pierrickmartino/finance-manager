'use client';

import { useInView } from 'motion/react';
import { createContext, useContext, type ReactNode, type RefObject } from 'react';

/** True inside Edit mode: the Story is drawn at rest, without reveals, count-ups or parallax. */
const StillContext = createContext(false);

export function StoryStillness({ isStill, children }: { isStill: boolean; children: ReactNode }) {
  return <StillContext.Provider value={isStill}>{children}</StillContext.Provider>;
}

export function useIsStill(): boolean {
  return useContext(StillContext);
}

/** No transition: a still Story jumps straight to its final state. */
export const INSTANT = { duration: 0 } as const;

/** Whether a chart is drawn: once it scrolls into view, or at once when the Story is still. */
export function useIsShown(ref: RefObject<Element | null>, margin: `${number}% 0px`): boolean {
  const isStill = useIsStill();
  const isInView = useInView(ref, { once: true, margin });
  return isStill || isInView;
}

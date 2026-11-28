'use client';

import { useRouter } from 'next/navigation';
import {
  useState,
  type Dispatch,
  type FocusEvent,
  type SetStateAction,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { FlowPoint } from '@/lib/reporting/card';
import type { Scale } from '@/lib/reporting/net-worth-chart';

/**
 * How a line flow's plot is read by pointer and keyboard (docs/design-system.md, "Charts").
 * Hovering, or the arrow keys, picks a point and shows its figures. A click opens the
 * Drill-down of the column whose area is under the pointer; from the keyboard, Enter (or Tab)
 * moves to the figures' own links, one per column. A touch has no hover: its first tap on a
 * point shows the figures, which can then be tapped, and a second tap on it opens its area.
 */

export type FlowSeries = 'income' | 'expense';

/** The point nearest the pointer, across the plot's width. */
function indexAt(event: MouseEvent<HTMLElement>, count: number): number {
  const box = event.currentTarget.getBoundingClientRect();
  const along = box.width === 0 ? 0 : (event.clientX - box.left) / box.width;
  return Math.min(count - 1, Math.max(0, Math.round(along * (count - 1))));
}

/**
 * The series whose area is under the pointer, where 0 is the plot's top and 100 its foot. The
 * areas overlap from zero: above the lower line only the higher series' area remains (and
 * above both, it is the nearer), below it the lower series' line bounds the area in front.
 */
export function seriesAt(height: number, point: FlowPoint, scale: Scale): FlowSeries {
  const [higher, lower]: [FlowSeries, FlowSeries] =
    point.income >= point.expense ? ['income', 'expense'] : ['expense', 'income'];
  return height <= scale.y(point[lower]) ? higher : lower;
}

/** How far down the plot the pointer is, from 0 at its top to 100 at its foot. */
function heightAt(event: MouseEvent<HTMLElement>): number {
  const box = event.currentTarget.getBoundingClientRect();
  return box.height === 0 ? 0 : ((event.clientY - box.top) / box.height) * 100;
}

/** Where a key moves the active point: a step either way, or to either end. */
function steppedIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, index - 1);
    case 'ArrowRight':
      return Math.min(count - 1, index + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

const HREF_OF: Record<FlowSeries, (point: FlowPoint) => string> = {
  income: (point) => point.incomeHref,
  expense: (point) => point.expenseHref,
};

/** Marks the active point's figures, where Enter sends focus to their first link. */
export const FIGURES_ATTRIBUTE = 'data-flow-figures';

export interface FlowPointer {
  /** The picked point's index, or null. */
  active: number | null;
  /** The picked point's figures take taps: it was picked by touch or a pen, not a mouse. */
  isTappable: boolean;
  /** The plot's control: the overlay the pointer and keyboard act on. */
  controlProps: HTMLAttributes<HTMLDivElement>;
  /** On the box holding the control and the figures: focus leaving both drops the point. */
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/** Which point of a chart is picked, and how a touch picks one before opening it. */
export interface TapToShow {
  /** The picked point's index, or null. */
  active: number | null;
  setActive: Dispatch<SetStateAction<number | null>>;
  /** The last pointer was a touch or a pen, not a mouse: the picked figures take taps. */
  isTappable: boolean;
  /** On the chart (or its capture phase): which kind of pointer is acting. */
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  /**
   * For a click on point `index`: a touch with no hover shows it first, so this picks it and
   * says the click is spent (true); a second tap on the picked point, or a mouse, opens it.
   */
  picksOnTap: (index: number) => boolean;
}

/**
 * A chart's picked point, shared by the line flow's plot and the bars flow's pairs: hovering or
 * focusing picks one, and a touch's first tap on a point shows its figures, its second opens it.
 */
export function useTapToShow(): TapToShow {
  const [active, setActive] = useState<number | null>(null);
  const [pointerType, setPointerType] = useState('mouse');
  const isTappable = pointerType !== 'mouse';
  return {
    active,
    setActive,
    isTappable,
    onPointerDown: (event) => setPointerType(event.pointerType),
    picksOnTap: (index) => {
      if (!isTappable || index === active) return false;
      setActive(index);
      return true;
    },
  };
}

export function useFlowPointer(points: readonly FlowPoint[], scale: Scale): FlowPointer {
  const router = useRouter();
  const { active, setActive, isTappable, onPointerDown, picksOnTap } = useTapToShow();
  const count = points.length;

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const index = indexAt(event, count);
    if (picksOnTap(index)) return;
    // The point shown: a click's whole-pixel position can land on a dense plot's neighbour.
    const point = points[active ?? index]!;
    router.push(HREF_OF[seriesAt(heightAt(event), point, scale)](point));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && active !== null) {
      event.preventDefault();
      // The figures sit beside the control, in the same box.
      event.currentTarget.parentElement
        ?.querySelector<HTMLElement>(`[${FIGURES_ATTRIBUTE}] a`)
        ?.focus();
      return;
    }
    const next = steppedIndex(event.key, active ?? count - 1, count);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  const onMouse = (event: PointerEvent<HTMLDivElement>, index: number | null) => {
    if (event.pointerType === 'mouse') setActive(index);
  };

  return {
    active,
    isTappable,
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
    },
    controlProps: {
      onPointerDown,
      onPointerMove: (event) => onMouse(event, indexAt(event, count)),
      onPointerLeave: (event) => onMouse(event, null),
      onClick,
      onFocus: (event) => {
        // Focus from the keyboard picks the latest point; a pointer picks its own.
        if (event.currentTarget.matches(':focus-visible')) {
          setActive((current) => current ?? count - 1);
        }
      },
      onKeyDown,
    },
  };
}

import type { CompletenessEntry } from '@/server/services/completeness';
import { addDays, daysBetween } from '@/server/services/fx/dates';

/** How many days back the Completeness check's coverage tracks reach, ending today. */
export const TIMELINE_DAYS = 120;

/** A run of days along a track, as percentages of its width. */
export interface TimelineSpan {
  left: number;
  width: number;
}

/** What one Account's coverage track draws, as percentages of the track. */
export interface Timeline {
  /** Data start through data end; null when the Imports cover no day in the window. */
  covered: TimelineSpan | null;
  /** Each Gap that reaches into the window. */
  gaps: TimelineSpan[];
  /** A Stale Account's run from the day after its data end up to today. */
  overdue: TimelineSpan | null;
  /** Each mismatch's Statement balance date inside the window. */
  mismatches: number[];
}

function windowStart(today: string): string {
  return addDays(today, -TIMELINE_DAYS);
}

/** Where the start of `date` falls along the track, unclipped. */
function offset(start: string, date: string): number {
  return (daysBetween(start, date) / TIMELINE_DAYS) * 100;
}

/** The days `from` through `to` (both included), clipped to the window; null when outside it. */
function span(start: string, from: string, to: string): TimelineSpan | null {
  const left = Math.max(0, offset(start, from));
  const right = Math.min(100, offset(start, addDays(to, 1)));
  return right > left ? { left, width: right - left } : null;
}

function overdueSpan(entry: CompletenessEntry, start: string, today: string): TimelineSpan | null {
  if (!entry.problems.some((problem) => problem.kind === 'stale')) return null;
  if (entry.dataEnd === null) return { left: 0, width: 100 };
  return span(start, addDays(entry.dataEnd, 1), today);
}

/** The coverage track of one Completeness check entry over the `TIMELINE_DAYS` up to `today`. */
export function timelineOf(entry: CompletenessEntry, today: string): Timeline {
  const start = windowStart(today);
  const covered =
    entry.dataStart !== null && entry.dataEnd !== null
      ? span(start, entry.dataStart, entry.dataEnd)
      : null;
  const gaps = entry.problems.flatMap((problem) => {
    if (problem.kind !== 'gap') return [];
    const gap = span(start, problem.from, problem.to);
    return gap ? [gap] : [];
  });
  const mismatches = entry.problems.flatMap((problem) => {
    if (problem.kind !== 'mismatch') return [];
    const position = offset(start, problem.statementDate);
    return position >= 0 && position <= 100 ? [position] : [];
  });
  return { covered, gaps, overdue: overdueSpan(entry, start, today), mismatches };
}

/** The first of each month inside the window, as `YYYY-MM` and its place along the track. */
export function monthTicks(today: string): { month: string; position: number }[] {
  const start = windowStart(today);
  const ticks: { month: string; position: number }[] = [];
  // The month the window starts in is left out: its first is on or before the left edge.
  for (let first = nextMonth(`${start.slice(0, 7)}-01`); first <= today; first = nextMonth(first)) {
    ticks.push({ month: first.slice(0, 7), position: offset(start, first) });
  }
  return ticks;
}

function nextMonth(firstOfMonth: string): string {
  return `${addDays(firstOfMonth, 31).slice(0, 7)}-01`;
}

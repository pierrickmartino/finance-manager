import { describe, expect, it } from 'vitest';
import type { CompletenessEntry } from '@/server/services/completeness';
import { TIMELINE_DAYS, monthTicks, timelineOf } from './completeness-timeline';

const TODAY = '2026-11-12';
/** The window starts TIMELINE_DAYS (120) before today: 2026-07-15. */
const DAY = 100 / TIMELINE_DAYS;

function entry(overrides: Partial<CompletenessEntry>): CompletenessEntry {
  return {
    account: { id: 'a', name: 'Current', bankName: 'Bank', currency: 'CHF' },
    dataStart: null,
    dataEnd: null,
    daysSince: null,
    isFreshnessChecked: true,
    problems: [],
    ...overrides,
  };
}

describe('timelineOf', () => {
  it('covers the window from the data start through the data end', () => {
    const timeline = timelineOf(entry({ dataStart: '2026-09-12', dataEnd: '2026-11-07' }), TODAY);

    expect(timeline.covered?.left).toBeCloseTo(59 * DAY);
    expect(timeline.covered?.width).toBeCloseTo(57 * DAY);
    expect(timeline.gaps).toEqual([]);
    expect(timeline.overdue).toBeNull();
    expect(timeline.mismatches).toEqual([]);
  });

  it('clips coverage that started before the window to its left edge', () => {
    const timeline = timelineOf(entry({ dataStart: '2025-01-01', dataEnd: '2026-11-08' }), TODAY);

    expect(timeline.covered?.left).toBe(0);
    expect(timeline.covered?.width).toBeCloseTo(117 * DAY);
  });

  it('draws a Gap as a span, first and last day included', () => {
    const timeline = timelineOf(
      entry({
        dataStart: '2026-07-01',
        dataEnd: '2026-11-08',
        problems: [{ kind: 'gap', from: '2026-08-14', to: '2026-08-14' }],
      }),
      TODAY,
    );

    expect(timeline.gaps).toHaveLength(1);
    expect(timeline.gaps[0]!.left).toBeCloseTo(30 * DAY);
    expect(timeline.gaps[0]!.width).toBeCloseTo(DAY);
  });

  it('leaves out a Gap that ends before the window starts', () => {
    const timeline = timelineOf(
      entry({
        dataStart: '2026-01-01',
        dataEnd: '2026-11-08',
        problems: [{ kind: 'gap', from: '2026-03-01', to: '2026-03-31' }],
      }),
      TODAY,
    );

    expect(timeline.gaps).toEqual([]);
  });

  it('marks a Stale Account overdue from the day after its data end up to today', () => {
    const timeline = timelineOf(
      entry({ dataStart: '2026-06-01', dataEnd: '2026-09-15', problems: [{ kind: 'stale' }] }),
      TODAY,
    );

    expect(timeline.overdue?.left).toBeCloseTo(63 * DAY);
    const { left, width } = timeline.overdue ?? { left: 0, width: 0 };
    expect(left + width).toBeCloseTo(100);
  });

  it('marks the whole window overdue for a Stale Account whose Imports cover nothing', () => {
    const timeline = timelineOf(entry({ problems: [{ kind: 'stale' }] }), TODAY);

    expect(timeline.covered).toBeNull();
    expect(timeline.overdue).toEqual({ left: 0, width: 100 });
  });

  it('draws nothing but an empty track for an Account with no Import yet', () => {
    const timeline = timelineOf(entry({ problems: [{ kind: 'never_imported' }] }), TODAY);

    expect(timeline).toEqual({ covered: null, gaps: [], overdue: null, mismatches: [] });
  });

  it('places a mismatch on its Statement balance date, and leaves out one before the window', () => {
    const timeline = timelineOf(
      entry({
        isFreshnessChecked: false,
        problems: [
          { kind: 'mismatch', differenceMinor: 2_000, statementDate: '2026-11-11' },
          { kind: 'mismatch', differenceMinor: 500, statementDate: '2026-01-31' },
        ],
      }),
      TODAY,
    );

    expect(timeline.mismatches).toHaveLength(1);
    expect(timeline.mismatches[0]).toBeCloseTo(119 * DAY);
  });
});

describe('monthTicks', () => {
  it('marks the first of each month inside the window', () => {
    const ticks = monthTicks(TODAY);

    expect(ticks.map((tick) => tick.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(ticks[0]!.position).toBeCloseTo(17 * DAY);
  });
});

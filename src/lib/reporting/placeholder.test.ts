import { describe, expect, it } from 'vitest';
import type { Visualisation, WidgetSource } from '@/server/services/reporting';
import type { Place } from './board';
import { cardPlaceholder } from './placeholder';

/** What a Widget's card placeholder is read from, before its query has run. */
const widget = (
  source: WidgetSource,
  visualisation: Visualisation,
  layout: Place | null = null,
) => ({ source, visualisation, layout });

describe('card placeholder height', () => {
  it('spans the rows of the stored layout and the gaps between them', () => {
    // 6 rows of 40px and the 5 gaps of 20px between them.
    expect(cardPlaceholder(widget('query', 'line', { x: 0, y: 0, w: 8, h: 6 })).height).toBe(340);
    expect(cardPlaceholder(widget('query', 'number', { x: 0, y: 0, w: 4, h: 1 })).height).toBe(40);
  });

  it('is as tall as the default card for its Widget when it has no stored layout', () => {
    // A number's card is 3 rows by default; a table's 8.
    expect(cardPlaceholder(widget('query', 'number')).height).toBe(160);
    expect(cardPlaceholder(widget('query', 'table')).height).toBe(460);
  });
});

describe('card placeholder shape', () => {
  it('hints at the mark the card will draw', () => {
    expect(cardPlaceholder(widget('query', 'number')).shape).toBe('number');
    expect(cardPlaceholder(widget('account_balances', 'table')).shape).toBe('ticks');
    expect(cardPlaceholder(widget('query', 'donut')).shape).toBe('ring');
    expect(cardPlaceholder(widget('query', 'table')).shape).toBe('grid');
    expect(cardPlaceholder(widget('query', 'line')).shape).toBe('bars');
    expect(cardPlaceholder(widget('query', 'stacked_bar')).shape).toBe('bars');
  });
});

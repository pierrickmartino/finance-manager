import { describe, expect, it } from 'vitest';
import { relativeDay, spotlight, type ActivityAmount } from './recent-activity';

const row = (id: string, amountMinor: number, currency = 'CHF'): ActivityAmount => ({
  id,
  amountMinor,
  currency,
});

describe('spotlight', () => {
  it('picks the Transaction of the largest size, whichever its sign', () => {
    const recent = [row('a', -1845), row('b', 685_000), row('c', -189_000)];

    const result = spotlight(recent);

    expect(result?.spotlit.id).toBe('b');
    expect(result?.rest.map((transaction) => transaction.id)).toEqual(['a', 'c']);
  });

  it('picks an expense when it is the largest', () => {
    expect(spotlight([row('a', 5000), row('b', -9000)])?.spotlit.id).toBe('b');
  });

  it('keeps the newest of a tie, so the order of the list decides', () => {
    expect(spotlight([row('newer', -500), row('older', 500)])?.spotlit.id).toBe('newer');
  });

  it('compares amounts in CHF only when the list mixes Currencies', () => {
    const recent = [row('eur', -900_000, 'EUR'), row('chf', -1000), row('usd', 50_000, 'USD')];

    expect(spotlight(recent)?.spotlit.id).toBe('chf');
  });

  it("compares in the newest Transaction's Currency when none is in CHF", () => {
    const recent = [
      row('eur-small', -100, 'EUR'),
      row('usd', -900_000, 'USD'),
      row('eur', -500, 'EUR'),
    ];

    expect(spotlight(recent)?.spotlit.id).toBe('eur');
  });

  it('keeps the rest in their order, the spotlit one taken out', () => {
    const recent = [row('a', -1), row('b', -2), row('c', -50), row('d', -3)];

    expect(spotlight(recent)?.rest.map((transaction) => transaction.id)).toEqual(['a', 'b', 'd']);
  });

  it('spotlights a single Transaction and leaves no rest', () => {
    expect(spotlight([row('only', -1)])).toEqual({ spotlit: row('only', -1), rest: [] });
  });

  it('returns null for no Transactions', () => {
    expect(spotlight([])).toBeNull();
  });
});

describe('relativeDay', () => {
  it('names today and yesterday', () => {
    expect(relativeDay(0)).toBe('Today');
    expect(relativeDay(1)).toBe('Yesterday');
  });

  it('counts the days within the past week', () => {
    expect(relativeDay(2)).toBe('2 days ago');
    expect(relativeDay(6)).toBe('6 days ago');
  });

  it('gives up from a week on, so the caller shows the date', () => {
    expect(relativeDay(7)).toBeNull();
    expect(relativeDay(40)).toBeNull();
  });

  it('gives up on a booking date in the future', () => {
    expect(relativeDay(-1)).toBeNull();
  });
});

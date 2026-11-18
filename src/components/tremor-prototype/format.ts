// PROTOTYPE (Tremor redesign): number formatting for the variants. Throwaway.
const chf = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' });
const chf0 = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (n: number) => chf.format(n);
export const money0 = (n: number) => chf0.format(n);
export const compactMoney = (n: number) => compact.format(n);
export const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
export const change = (now: number, then: number) =>
  then === 0 ? 0 : (now - then) / Math.abs(then);
export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

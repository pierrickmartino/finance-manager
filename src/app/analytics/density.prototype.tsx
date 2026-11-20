/**
 * PROTOTYPE ONLY — throwaway, do not merge to main.
 *
 * Question: how can Analytics show a bit more information per screen?
 * Three variants of the existing /analytics route, switchable via `?variant=` (dev only, floating
 * switcher, ← / → keys). The data fetching and every section's card stay as they are; only the
 * arrangement and the cards' density change:
 *
 * - current: today's page
 * - A Compact grid: tighter cards; the overview becomes four across (Account balances joins
 *   it), Net cash flow beside Spending by category, the heatmaps with tighter rows
 * - B Figures first: a dense band of every section's headline and facts at the top, then the
 *   compact charts three across and the heatmaps
 * - C Rail + canvas: a sticky rail of the list-like sections (Net worth, balances, spending by
 *   category, recent) beside a canvas of the period charts and heatmaps
 */
import type { ReactNode } from 'react';

export const DENSITY_VARIANTS = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: 'Compact grid' },
  { key: 'B', name: 'Figures first' },
  { key: 'C', name: 'Rail + canvas' },
] as const;

export type DensityVariant = (typeof DENSITY_VARIANTS)[number]['key'];

export function densityVariant(raw: string | string[] | undefined): DensityVariant {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return DENSITY_VARIANTS.some((v) => v.key === value) ? (value as DensityVariant) : 'current';
}

/** Each section, already wrapped in its StreamedSection by the page. */
export interface DensitySlots {
  netWorth: ReactNode;
  insights: ReactNode;
  recent: ReactNode;
  netCashFlow: ReactNode;
  balances: ReactNode;
  spendingByCategory: ReactNode;
  incomeVsExpense: ReactNode;
  categoriesPerPeriod: ReactNode;
  /** Variant B's band of figures. */
  figures: ReactNode;
}

/**
 * Tightens the shared Dashboard cards from outside, by overriding their utility classes inside
 * `.proto-dense` (unlayered CSS beats Tailwind's layered utilities). A real version would give
 * the cards a density prop instead.
 */
const DENSE_CSS = `
.proto-dense .rounded-3xl.p-5 { padding: 0.875rem 1rem; }
.proto-dense section.gap-4, .proto-dense section > .gap-4 { gap: 0.625rem; }
.proto-dense .text-4xl { font-size: 1.75rem; line-height: 2.1rem; }
.proto-dense .text-3xl { font-size: 1.4rem; line-height: 1.8rem; }
.proto-dense .font-display.text-2xl { font-size: 1.15rem; }
.proto-dense .text-xl { font-size: 1rem; }
.proto-dense .h-52 { height: 8.5rem; padding-top: 1.5rem; }
.proto-dense .h-40 { height: 7rem; }
.proto-dense .mt-6 { margin-top: 0.75rem; }
.proto-dense .pt-6 { padding-top: 0.75rem; }
.proto-dense .mt-4 { margin-top: 0.5rem; }
.proto-dense .gap-3 { gap: 0.4rem; }
.proto-dense .p-3 { padding: 0.4rem 0.6rem; }
.proto-dense .py-3 { padding-top: 0.3rem; padding-bottom: 0.3rem; }
.proto-dense .flex-col.gap-4 { gap: 0.4rem; }
.proto-dense .flex-col.gap-2 { gap: 0.2rem; }
.proto-dense .py-2 { padding-top: 0.2rem; padding-bottom: 0.2rem; }
.proto-dense .py-1\\.5 { padding-top: 0.15rem; padding-bottom: 0.15rem; }
.proto-dense .mt-\\[0\\.9rem\\] { margin-top: 0.6rem; }
.proto-dense .pt-4 { padding-top: 0.5rem; }
.proto-dense .border-spacing-1 { border-spacing: 2px; }
`;

function Dense({ children }: { children: ReactNode }) {
  return (
    <div className="proto-dense grid min-w-0 grid-cols-1 gap-3">
      <style>{DENSE_CSS}</style>
      {children}
    </div>
  );
}

/** A: today's order, tighter, and packed wider. */
function VariantA({ s }: { s: DensitySlots }) {
  return (
    <Dense>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {s.netWorth}
        {s.insights}
        {s.recent}
        {s.balances}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        {s.netCashFlow}
        {s.spendingByCategory}
      </div>
      {s.incomeVsExpense}
      {s.categoriesPerPeriod}
    </Dense>
  );
}

/** B: the numbers first, as a band, then the charts that explain them. */
function VariantB({ s }: { s: DensitySlots }) {
  return (
    <Dense>
      {s.figures}
      {/* Three independent columns (masonry), so no card waits on its row's tallest. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-3 xl:grid-cols-3">
        <div className="grid min-w-0 gap-3">
          {s.netWorth}
          {/* The insight card stretches to its grid area for its bars: give it one. */}
          <div className="grid h-[22rem] min-w-0">{s.insights}</div>
        </div>
        <div className="grid min-w-0 gap-3">
          {s.netCashFlow}
          {s.balances}
          {s.recent}
        </div>
        <div className="grid min-w-0 gap-3">{s.spendingByCategory}</div>
      </div>
      {s.incomeVsExpense}
      {s.categoriesPerPeriod}
    </Dense>
  );
}

/** C: a rail of what is a list, a canvas of what runs over periods. */
function VariantC({ s }: { s: DensitySlots }) {
  return (
    <Dense>
      <div className="grid min-w-0 grid-cols-1 items-start gap-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="grid min-w-0 gap-3 xl:sticky xl:top-14">
          {s.netWorth}
          {s.balances}
          {s.spendingByCategory}
          {s.recent}
        </aside>
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            {s.insights}
            {s.netCashFlow}
          </div>
          {s.incomeVsExpense}
          {s.categoriesPerPeriod}
        </div>
      </div>
    </Dense>
  );
}

export function DensityLayout({
  variant,
  slots,
}: {
  variant: DensityVariant;
  slots: DensitySlots;
}) {
  if (variant === 'A') return <VariantA s={slots} />;
  if (variant === 'B') return <VariantB s={slots} />;
  return <VariantC s={slots} />;
}

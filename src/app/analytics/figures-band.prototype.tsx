/**
 * PROTOTYPE ONLY — throwaway (see ./density.prototype.tsx). Variant B's band: every section's
 * headline and facts as one dense table of figures, each opening its Drill-down.
 */
import { TILE_CLASS } from '@/components/surface';
import type { AnalyticsCard, AnalyticsNetWorth } from '@/server/services/analytics';
import { FiguresBandGrid } from './figures-band-grid.prototype';

interface FiguresBandProps {
  netWorth: Promise<AnalyticsNetWorth>;
  cards: Promise<AnalyticsCard>[];
}

export async function FiguresBand({ netWorth, cards }: FiguresBandProps) {
  const [worth, ...loaded] = await Promise.all([netWorth, ...cards]);
  const balances = worth.cards.find((card) => card.source === 'account_balances');
  return (
    <section aria-label="Key figures" className={`${TILE_CLASS} min-w-0`}>
      <FiguresBandGrid cards={[...(balances ? [balances] : []), ...loaded]} />
    </section>
  );
}

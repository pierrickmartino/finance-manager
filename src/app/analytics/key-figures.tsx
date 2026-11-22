import Link from 'next/link';
import { HEADLINE_AMOUNT_CLASS, PLACEHOLDER_CLASS, TILE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { plural } from '@/lib/reporting/drill-summary';
import { KEY_FIGURES, type AnalyticsKeyFigures, type KeyFigure } from '@/server/services/analytics';

/** Four equal tiles: one row from `lg` up, a 2×2 grid below. */
const ROW_CLASS = 'grid min-w-0 grid-cols-2 gap-5 lg:grid-cols-4';
/** One tile; its change line and sparkline stack under the amount. */
const FIGURE_CLASS = `${TILE_CLASS} flex min-w-0 flex-col gap-1`;

const PLACEHOLDER_LABELS = ['Net worth', 'Income', 'Expense', 'Profit'] as const;

/** Key figures while they load: the four tiles, each its label over a quiet block. */
export function KeyFiguresPlaceholder() {
  return (
    <section aria-label={KEY_FIGURES} aria-busy="true" className={ROW_CLASS}>
      <span className="sr-only">Loading</span>
      {PLACEHOLDER_LABELS.map((label) => (
        <div key={label} className={FIGURE_CLASS}>
          <h3 className="font-medium">{label}</h3>
          <div className={`${PLACEHOLDER_CLASS} mt-2 h-9 w-2/3`} />
        </div>
      ))}
    </section>
  );
}

interface FigureTileProps {
  figure: KeyFigure;
  fmt: Formatter;
}

/** One figure's tile: its label and when it stands, then its amount opening what is behind it. */
function FigureTile({ figure, fmt }: FigureTileProps) {
  const { count, of } = figure.unconverted;
  return (
    <section aria-label={figure.label} className={FIGURE_CLASS}>
      <h3 className="font-medium">{figure.label}</h3>
      {figure.isEmpty ? (
        <p className="mt-2 text-sm text-muted">Nothing to show yet: no Account holds money.</p>
      ) : (
        <>
          <p className="text-sm text-muted">{figure.caption}</p>
          <Link
            href={figure.href}
            className={`${HEADLINE_AMOUNT_CLASS} mt-2 truncate hover:underline ${figure.value < 0 ? 'text-negative' : ''}`}
          >
            {fmt.amount(figure.value, { currency: 'CHF', isWhole: true })}
          </Link>
        </>
      )}
      {count > 0 && (
        <p className="text-sm text-warning">{plural(count, of)} left out: no FX rate yet.</p>
      )}
    </section>
  );
}

interface KeyFiguresSectionProps {
  keyFigures: Promise<AnalyticsKeyFigures>;
  fmt: Formatter;
}

/**
 * Analytics' Key figures, once they arrive: Net worth today, then Income, Expense and Profit
 * over the current period to date, each a tile whose amount opens what is behind it.
 */
export async function KeyFiguresSection({ keyFigures, fmt }: KeyFiguresSectionProps) {
  const { figures } = await keyFigures;
  return (
    <section aria-labelledby="key-figures-title" className={ROW_CLASS}>
      <h2 id="key-figures-title" className="sr-only">
        {KEY_FIGURES}
      </h2>
      {figures.map((figure) => (
        <FigureTile key={figure.id} figure={figure} fmt={fmt} />
      ))}
    </section>
  );
}

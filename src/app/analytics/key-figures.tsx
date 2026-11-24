import Link from 'next/link';
import { PLACEHOLDER_CLASS, TILE_AMOUNT_CLASS, TILE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { KEY_FIGURES, type AnalyticsKeyFigures, type KeyFigure } from '@/server/services/analytics';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { EXPENSE_VARIANT_COMPONENTS, type ExpenseVariantKey } from './expense-tile.prototype';
import { FigureSparklineMark } from './figure-sparkline-mark';
import { ChangeLine } from './key-figure-change';
import { UnconvertedNote } from './section';

/** Four equal tiles: one row from `lg` up, a 2×2 grid below, tighter on phones. */
const ROW_CLASS = 'grid min-w-0 grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4';
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

/**
 * One figure's tile: its label and when it stands, then its amount opening what is behind it,
 * and its sparkline at the foot.
 */
function FigureTile({ figure, fmt }: FigureTileProps) {
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
            className={`${TILE_AMOUNT_CLASS} mt-2 hover:underline ${figure.value < 0 ? 'text-negative' : ''}`}
          >
            {fmt.amount(figure.value, { currency: BASE_CURRENCY, isWhole: true })}
          </Link>
          {figure.change && <ChangeLine change={figure.change} fmt={fmt} />}
        </>
      )}
      {!figure.isEmpty && <FigureSparklineMark points={figure.sparkline} />}
      {figure.unconverted.count > 0 && <UnconvertedNote {...figure.unconverted} />}
    </section>
  );
}

interface KeyFiguresSectionProps {
  keyFigures: Promise<AnalyticsKeyFigures>;
  fmt: Formatter;
  /** PROTOTYPE: which Expense tile variant to draw (expense-tile.prototype.tsx). */
  expenseVariant?: ExpenseVariantKey;
}

/**
 * Analytics' Key figures, once they arrive: Net worth today, then Income, Expense and Profit
 * over the current interval to date, each a tile whose amount opens what is behind it.
 */
export async function KeyFiguresSection({
  keyFigures,
  fmt,
  expenseVariant = 'current',
}: KeyFiguresSectionProps) {
  const { figures } = await keyFigures;
  const income = figures.find((figure) => figure.id === 'income');
  return (
    <section aria-labelledby="key-figures-title" className={ROW_CLASS}>
      <h2 id="key-figures-title" className="sr-only">
        {KEY_FIGURES}
      </h2>
      {figures.map((figure) => {
        if (figure.id === 'expense' && expenseVariant !== 'current') {
          const Variant = EXPENSE_VARIANT_COMPONENTS[expenseVariant];
          return <Variant key={figure.id} expense={figure} income={income} fmt={fmt} />;
        }
        return <FigureTile key={figure.id} figure={figure} fmt={fmt} />;
      })}
    </section>
  );
}

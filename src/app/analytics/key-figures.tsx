import Link from 'next/link';
import {
  PLACEHOLDER_CLASS,
  TILE_AMOUNT_CLASS,
  TILE_CLASS,
  TITLE_ROW_CLASS,
} from '@/components/surface';
import type { Formatter } from '@/lib/format';
import {
  KEY_FIGURES,
  type AnalyticsKeyFigures,
  type KeyFigure,
  type KeyFigureId,
} from '@/server/services/analytics';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
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

/** How a tile lays out what it carries. */
interface TileLook {
  /** Its caption beside its label, top right, rather than under it. */
  isCaptionBeside: boolean;
  /** Its change line gives the % alone, without the absolute change. */
  isPercentOnly: boolean;
  /** Its sparkline curves through the points rather than joining them straight. */
  isSmooth: boolean;
}

const CLASSIC_LOOK: TileLook = { isCaptionBeside: false, isPercentOnly: false, isSmooth: false };
const FLOW_LOOK: TileLook = { isCaptionBeside: true, isPercentOnly: true, isSmooth: true };

/**
 * Income, Expense and Profit read their Period beside their label, their change as a %, and
 * their trend as a curve; Net worth keeps its "Today" under its label and its change in CHF.
 */
const TILE_LOOKS: Record<KeyFigureId, TileLook> = {
  netWorth: CLASSIC_LOOK,
  income: FLOW_LOOK,
  expense: FLOW_LOOK,
  profit: FLOW_LOOK,
};

interface FigureTileProps {
  figure: KeyFigure;
  fmt: Formatter;
}

/**
 * One figure's tile: its label and when it stands, then its amount opening what is behind it,
 * and its sparkline at the foot.
 */
function FigureTile({ figure, fmt }: FigureTileProps) {
  const look = TILE_LOOKS[figure.id];
  const caption = <p className="text-sm text-muted">{figure.caption}</p>;
  return (
    <section aria-label={figure.label} className={FIGURE_CLASS}>
      {look.isCaptionBeside && !figure.isEmpty ? (
        <div className={`${TITLE_ROW_CLASS} items-baseline`}>
          <h3 className="font-medium">{figure.label}</h3>
          {caption}
        </div>
      ) : (
        <h3 className="font-medium">{figure.label}</h3>
      )}
      {figure.isEmpty ? (
        <p className="mt-2 text-sm text-muted">Nothing to show yet: no Account holds money.</p>
      ) : (
        <>
          {!look.isCaptionBeside && caption}
          <Link
            href={figure.href}
            className={`${TILE_AMOUNT_CLASS} mt-2 hover:underline ${figure.value < 0 ? 'text-negative' : ''}`}
          >
            {fmt.amount(figure.value, { currency: BASE_CURRENCY, isWhole: true })}
          </Link>
          {figure.change && (
            <ChangeLine change={figure.change} fmt={fmt} isPercentOnly={look.isPercentOnly} />
          )}
        </>
      )}
      {!figure.isEmpty && (
        <FigureSparklineMark points={figure.sparkline} isSmooth={look.isSmooth} />
      )}
      {figure.unconverted.count > 0 && <UnconvertedNote {...figure.unconverted} />}
    </section>
  );
}

interface KeyFiguresSectionProps {
  keyFigures: Promise<AnalyticsKeyFigures>;
  fmt: Formatter;
}

/**
 * Analytics' Key figures, once they arrive: Net worth today, then Income, Expense and Profit
 * over the current interval to date, each a tile whose amount opens what is behind it.
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

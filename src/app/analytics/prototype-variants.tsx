/**
 * PROTOTYPE, throwaway. Three variants of the Analytics page, switchable via `?variant=` on the
 * existing `/analytics` route, all reaching for the attached "Finance Dashboard" mockup:
 *   A  Mockup grid: the mockup's own order: KPI tiles, cash flow beside P&L, breakdown beside bars…
 *   B  Command rail: a left rail of figures + activity, one hero chart, the rest in two columns.
 *   C  Chapters: one KPI band, then the page told in titled chapters with a jump nav.
 * `current` keeps today's page for comparison. Every variant draws the same streamed sections;
 * only the arrangement, the header and the Key figures' treatment change.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  GLASS_CLASS,
  PAGE_TITLE_CLASS,
  SECTION_TITLE_CLASS,
  TILE_AMOUNT_CLASS,
  TILE_CLASS,
} from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { directionOf } from '@/lib/reporting/change-direction';
import type { AnalyticsKeyFigures, KeyFigure, KeyFigureId } from '@/server/services/analytics';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { FigureSparklineMark } from './figure-sparkline-mark';

export const PROTOTYPE_VARIANTS = [
  { key: 'A', name: 'Mockup grid' },
  { key: 'B', name: 'Command rail' },
  { key: 'C', name: 'Chapters' },
  { key: 'current', name: 'Today’s page' },
] as const;
export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number]['key'];

/** Every slot a variant arranges; each is an already-wrapped StreamedSection. */
export interface Slots {
  completeness: ReactNode;
  period: ReactNode;
  keyFigures: ReactNode;
  netWorth: ReactNode;
  insights: ReactNode;
  recent: ReactNode;
  incomeVsExpense: ReactNode;
  accountBalances: ReactNode;
  spendingByCategory: ReactNode;
  profitAndLoss: ReactNode;
  netCashFlow: ReactNode;
  profitPerInterval: ReactNode;
  categoriesPerInterval: ReactNode;
}

// Header ---------------------------------------------------------------------------------------

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Europe/Zurich',
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Key figure pieces ----------------------------------------------------------------------------

const FIGURE_ICON: Record<KeyFigureId, { path: string; tone: string }> = {
  netWorth: { path: 'M3 7h18v12H3zM3 11h18M16 15h2', tone: 'text-ramp-1' },
  income: { path: 'M12 4v14M6 12l6 6 6-6', tone: 'text-positive' },
  expense: { path: 'M12 20V6M6 12l6-6 6 6', tone: 'text-ramp-4' },
  profit: { path: 'M5 20v-6M10 20V9M15 20v-4M20 20V5', tone: 'text-ramp-2' },
};

function FigureBadge({ id, size = 'h-11 w-11' }: { id: KeyFigureId; size?: string }) {
  const { path, tone } = FIGURE_ICON[id];
  return (
    <span
      aria-hidden
      className={`grid ${size} shrink-0 place-items-center rounded-xl bg-sunken ring-1 ring-ink/10 ${tone}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  );
}

/** "↗ 12.5%": the change's arrow and percent (or amount), in good/bad tone, one link. */
function CompactChange({ figure, fmt }: { figure: KeyFigure; fmt: Formatter }) {
  const change = figure.change;
  if (!change) return <span className="text-sm text-muted">—</span>;
  const { arrow, sign } = directionOf(change.amount);
  const tone =
    change.isGood === null ? 'text-muted' : change.isGood ? 'text-positive' : 'text-negative';
  const figureText =
    change.percent === null
      ? `${sign}${fmt.amount(Math.abs(change.amount), { currency: BASE_CURRENCY, isWhole: true })}`
      : `${sign}${fmt.percent(Math.abs(change.percent))}`;
  return (
    <Link
      href={change.href}
      title={change.label}
      className={`text-sm font-medium tabular-nums hover:underline ${tone}`}
    >
      <span aria-hidden className="mr-1">
        {arrow}
      </span>
      {figureText}
    </Link>
  );
}

function FigureAmount({
  figure,
  fmt,
  className = TILE_AMOUNT_CLASS,
}: {
  figure: KeyFigure;
  fmt: Formatter;
  className?: string;
}) {
  return (
    <Link
      href={figure.href}
      className={`${className} hover:underline ${figure.value < 0 ? 'text-negative' : ''}`}
    >
      {fmt.amount(figure.value, { currency: BASE_CURRENCY, isWhole: true })}
    </Link>
  );
}

interface FiguresProps {
  keyFigures: Promise<AnalyticsKeyFigures>;
  fmt: Formatter;
}

/** A: the mockup's tiles: badge, label over amount, change bottom-left, sparkline bottom-right. */
export async function MockupKeyFigures({ keyFigures, fmt }: FiguresProps) {
  const { figures } = await keyFigures;
  return (
    <section
      aria-label="Key figures"
      className="grid min-w-0 grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"
    >
      {figures.map((figure) => (
        <section
          key={figure.id}
          aria-label={figure.label}
          className={`${TILE_CLASS} flex min-w-0 flex-col gap-3`}
        >
          <div className="flex items-start gap-3">
            <FigureBadge id={figure.id} />
            <div className="flex min-w-0 flex-col">
              <h3 className="text-sm text-muted">{figure.label}</h3>
              <FigureAmount figure={figure} fmt={fmt} />
            </div>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5 pb-1">
              <CompactChange figure={figure} fmt={fmt} />
              <span className="text-xs text-muted">{figure.caption}</span>
            </div>
            <div className="w-1/2 max-w-40 min-w-16">
              {!figure.isEmpty && <FigureSparklineMark points={figure.sparkline} />}
            </div>
          </div>
        </section>
      ))}
    </section>
  );
}

/** B: the figures stacked in one rail card, each a row with its sparkline to the right. */
export async function RailKeyFigures({ keyFigures, fmt }: FiguresProps) {
  const { figures } = await keyFigures;
  return (
    <section
      aria-label="Key figures"
      className={`${TILE_CLASS} flex flex-col divide-y divide-rule p-0`}
    >
      {figures.map((figure) => (
        <div key={figure.id} className="flex items-center gap-3 px-4 py-3.5">
          <FigureBadge id={figure.id} size="h-9 w-9" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="text-xs text-muted">{figure.label}</h3>
            <FigureAmount
              figure={figure}
              fmt={fmt}
              className="font-display text-lg tracking-tight whitespace-nowrap tabular-nums"
            />
            <CompactChange figure={figure} fmt={fmt} />
          </div>
          <div className="w-20 shrink-0 [&_[data-sparkline]]:pt-0">
            {!figure.isEmpty && <FigureSparklineMark points={figure.sparkline} />}
          </div>
        </div>
      ))}
    </section>
  );
}

/** C: one glass band, four cells split by rules; the numbers carry the band, no sparklines. */
export async function BandKeyFigures({ keyFigures, fmt }: FiguresProps) {
  const { figures } = await keyFigures;
  return (
    <section
      aria-label="Key figures"
      className={`${TILE_CLASS} grid grid-cols-2 gap-y-5 p-0 py-5 lg:grid-cols-4 lg:divide-x lg:divide-rule`}
    >
      {figures.map((figure) => (
        <div key={figure.id} className="flex flex-col gap-1 px-6">
          <h3 className="flex items-center gap-2 text-sm text-muted">
            <FigureBadge id={figure.id} size="h-6 w-6 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5" />
            {figure.label}
          </h3>
          <FigureAmount
            figure={figure}
            fmt={fmt}
            className="font-display text-3xl tracking-tight tabular-nums sm:text-4xl"
          />
          <div className="flex items-baseline gap-2">
            <CompactChange figure={figure} fmt={fmt} />
            <span className="text-xs text-muted">{figure.caption}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

// Variants -------------------------------------------------------------------------------------

/** A: the mockup's grid, section for section. */
export function VariantA({ s }: { s: Slots }) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1 pt-2">
        <p className="text-muted">{greeting()} 👋</p>
        <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight">
          Analytics
        </h1>
        <p className="text-muted">Track. Plan. Grow. Your finances over the Period you choose.</p>
      </header>
      {s.period}
      {s.completeness}
      {s.keyFigures}
      {/* Cash flow (Income vs expense) beside Profit & loss. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="grid min-w-0 lg:col-span-3">{s.incomeVsExpense}</div>
        <div className="grid min-w-0 lg:col-span-2">{s.profitAndLoss}</div>
      </div>
      {/* Expense breakdown beside Revenue vs expense. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        {s.spendingByCategory}
        {s.profitPerInterval}
      </div>
      {/* Portfolio performance (Net worth) beside Budget allocation (Account balances). */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="grid min-w-0 lg:col-span-3">{s.netWorth}</div>
        <div className="grid min-w-0 lg:col-span-2">{s.accountBalances}</div>
      </div>
      {/* Recent invoices / Financial activity. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        {s.netCashFlow}
        {s.recent}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
        {s.insights}
        <div className="grid min-w-0 lg:col-span-2">{s.categoriesPerInterval}</div>
      </div>
    </section>
  );
}

/** B: a sticky rail of figures and activity; one hero chart; the rest in two columns. */
export function VariantB({ s }: { s: Slots }) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className={`${PAGE_TITLE_CLASS} text-3xl font-semibold`}>Finance overview</h1>
        </div>
      </header>
      {s.period}
      {s.completeness}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
          {s.keyFigures}
          {s.insights}
          {s.recent}
        </aside>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="[&_svg]:min-h-0">{s.incomeVsExpense}</div>
          <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
            {s.netWorth}
            {s.profitAndLoss}
            {s.spendingByCategory}
            {s.accountBalances}
            {s.profitPerInterval}
            {s.netCashFlow}
          </div>
          {s.categoriesPerInterval}
        </div>
      </div>
    </section>
  );
}

const CHAPTERS = [
  { id: 'standing', title: 'Where you stand', blurb: 'What you own today, and where it sits.' },
  {
    id: 'flow',
    title: 'Money in and out',
    blurb: 'What came in, what went out, interval by interval.',
  },
  { id: 'spending', title: 'Where it went', blurb: 'Your spending by Category, and what changed.' },
  {
    id: 'statement',
    title: 'The statement',
    blurb: 'The Period’s profit and loss, and the latest Transactions.',
  },
] as const;

function Chapter({ id, children }: { id: (typeof CHAPTERS)[number]['id']; children: ReactNode }) {
  const chapter = CHAPTERS.find((c) => c.id === id)!;
  const number = CHAPTERS.indexOf(chapter) + 1;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4">
      <header className="flex items-baseline gap-3 border-b border-rule pb-2">
        <span className="font-display text-sm text-accent-ink tabular-nums">0{number}</span>
        <h2 id={`${id}-title`} className={SECTION_TITLE_CLASS}>
          {chapter.title}
        </h2>
        <p className="hidden text-sm text-muted sm:block">{chapter.blurb}</p>
      </header>
      {children}
    </section>
  );
}

/** C: a KPI band, a jump nav, then the page told in four titled chapters. */
export function VariantC({ s }: { s: Slots }) {
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            Your money, in four chapters
          </h1>
        </div>
        <nav
          aria-label="Chapters"
          className={`${GLASS_CLASS} flex w-fit flex-wrap gap-1 rounded-xl p-1 text-sm`}
        >
          {CHAPTERS.map((chapter, i) => (
            <a
              key={chapter.id}
              href={`#${chapter.id}`}
              className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <span className="mr-1.5 text-accent-ink tabular-nums">0{i + 1}</span>
              {chapter.title}
            </a>
          ))}
        </nav>
      </header>
      <div className="flex flex-col gap-5">
        {s.period}
        {s.completeness}
        {s.keyFigures}
      </div>
      <Chapter id="standing">
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="grid min-w-0 lg:col-span-2">{s.netWorth}</div>
          {s.accountBalances}
        </div>
      </Chapter>
      <Chapter id="flow">
        {s.incomeVsExpense}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="grid min-w-0 lg:col-span-2">{s.profitPerInterval}</div>
          {s.netCashFlow}
        </div>
      </Chapter>
      <Chapter id="spending">
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          {s.spendingByCategory}
          <div className="grid min-w-0 lg:col-span-2">{s.insights}</div>
        </div>
        {s.categoriesPerInterval}
      </Chapter>
      <Chapter id="statement">
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="grid min-w-0 lg:col-span-2">{s.profitAndLoss}</div>
          {s.recent}
        </div>
      </Chapter>
    </section>
  );
}

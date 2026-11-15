'use client';

/*
 * PROTOTYPE, throwaway. Question: what should the insight card ("Spending is easing.") look like
 * once it stands as tall as "Recent activity" (both span the overview row's two rows from `lg` up)?
 * Four variants on the Dashboard route, switched with `?variant=now|A|B|C`:
 *   A    Month bars: the sentence on top, then each full month's spending as a bar against the
 *        average, the latest lit, filling the height
 *   B    Three findings: the change, the share kept and the latest month's spend, each as one
 *        large number down the card
 *   C    Split: the navy callout on top, then a light panel setting the latest month's in, out
 *        and kept against the monthly average
 *   now  the card as it ships today, for comparison (sits at its own height)
 */

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { PrototypeSwitcher, usePrototypeVariant } from '@/components/prototype-switcher';
import { readCard, type CardFlow, type MonthFlow, type WidgetCardData } from '@/lib/reporting/card';
import { changeOverAverage, spendingInsight } from '@/lib/reporting/overview';
import { FigureLink } from '../figure-link';
import { InsightCard } from './overview-row';

const VARIANTS = [
  { key: 'A', name: 'Month bars' },
  { key: 'B', name: 'Three findings' },
  { key: 'C', name: 'Split' },
  { key: 'now', name: 'As shipped' },
];

type Money = (minor: number) => string;
type Insight = NonNullable<ReturnType<typeof spendingInsight>>;

interface VariantProps {
  flow: CardFlow;
  insight: Insight;
  money: Money;
}

const TALL = 'flex flex-col rounded-3xl p-6 shadow-lg lg:row-span-2 lg:self-stretch';
const short = (label: string) => label.split(' ')[0] ?? label;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => (values.length === 0 ? 0 : sum(values) / values.length);

function overviewFlow(cards: WidgetCardData[], money: Money): CardFlow | null {
  for (const card of cards) {
    const { flow } = readCard(card, money);
    if (flow) return flow;
  }
  return null;
}

/** The latest full month and the full months before it. */
function split(flow: CardFlow): { latest: MonthFlow; before: MonthFlow[]; full: MonthFlow[] } {
  const full = flow.months.filter((month) => !month.isPartial);
  return { latest: full.at(-1)!, before: full.slice(0, -1), full };
}

function Sentence({ flow, insight, className }: VariantProps & { className?: string }) {
  const [before, change, after] = insight.detail;
  return (
    <p className={className}>
      {before}
      <FigureLink
        href={flow.changeHref}
        className={flow.changeHref ? 'underline underline-offset-4' : ''}
      >
        {change}
      </FigureLink>
      {after}
    </p>
  );
}

function Cta({ flow, className = '' }: { flow: CardFlow; className?: string }) {
  if (!flow.latestHref) return null;
  return (
    <Link
      href={flow.latestHref}
      className={`self-start rounded-lg bg-on-hero px-5 py-2.5 text-sm font-medium text-hero shadow-lg hover:bg-on-hero/90 ${className}`}
    >
      See the Transactions
    </Link>
  );
}

/* ---------- A: Month bars ---------- */

function VariantA(props: VariantProps) {
  const { flow, insight, money } = props;
  const { latest, before, full } = split(flow);
  const avg = average(before.map((month) => month.expense));
  const top = Math.max(1, avg, ...full.map((month) => month.expense));
  return (
    <section aria-labelledby="overview-insight" className={`${TALL} bg-insight text-on-hero`}>
      <h2 id="overview-insight" className="font-display text-3xl leading-tight tracking-tight">
        {insight.headline}
      </h2>
      <Sentence {...props} className="mt-3 max-w-sm text-on-hero/80" />
      <div className="mt-6 flex min-h-40 flex-1 flex-col">
        <div className="flex items-baseline justify-between text-xs text-on-hero/70">
          <span>Spent per month</span>
          <span>
            Average <span className="tabular-nums">{money(Math.round(avg))}</span>
          </span>
        </div>
        <div className="relative mt-2 flex h-32 items-end gap-1.5 lg:h-auto lg:flex-1">
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-on-hero/50"
            style={{ bottom: `${(avg / top) * 100}%` }}
          />
          {full.map((month) => {
            const isLatest = month === latest;
            return (
              <div
                key={month.label}
                title={`${month.label}: ${money(month.expense)}`}
                className={`flex-1 rounded-t-md ${isLatest ? 'bg-on-hero' : 'bg-on-hero/25'}`}
                style={{ height: `${Math.max(2, (month.expense / top) * 100)}%` }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5 text-[10px] text-on-hero/60">
          {full.map((month) => (
            <span
              key={month.label}
              className={`flex-1 truncate text-center ${month === latest ? 'font-medium text-on-hero' : ''}`}
            >
              {short(month.label).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
      <Cta flow={flow} className="mt-6" />
    </section>
  );
}

/* ---------- B: Three findings ---------- */

function Finding({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="border-t border-on-hero/20 py-3.5 first:border-t-0 first:pt-0">
      <div className={`font-display text-5xl tracking-tight tabular-nums ${tone ?? ''}`}>
        {value}
      </div>
      <div className="mt-1 text-sm text-on-hero/75">{label}</div>
    </div>
  );
}

function VariantB(props: VariantProps) {
  const { flow, insight, money } = props;
  const { latest, before, full } = split(flow);
  const change = changeOverAverage(
    latest.expense,
    before.map((month) => month.expense),
  );
  const income = sum(full.map((month) => month.income));
  const kept = income === 0 ? 0 : (income - sum(full.map((month) => month.expense))) / income;
  const shown = Math.round(Math.abs(change) * 100);
  const sign = shown === 0 ? '' : change > 0 ? '+' : '−';
  return (
    <section aria-labelledby="overview-insight" className={`${TALL} bg-insight text-on-hero`}>
      <h2 id="overview-insight" className="font-display text-3xl leading-tight tracking-tight">
        {insight.headline}
      </h2>
      <div className="mt-6 flex flex-1 flex-col justify-center">
        <Finding
          value={`${sign}${shown}%`}
          label={`${short(latest.label)}'s spending against your monthly average`}
        />
        <Finding
          value={`${Math.round(kept * 100)}%`}
          label={`of everything that came in, kept over ${full.length} months`}
        />
        <Finding value={money(latest.expense)} label={`spent in ${latest.label}`} />
      </div>
      <Cta flow={flow} className="mt-6" />
    </section>
  );
}

/* ---------- C: Split ---------- */

function Compare({
  label,
  month,
  avg,
  top,
  money,
  tone,
}: {
  label: string;
  month: number;
  avg: number;
  top: number;
  money: Money;
  tone: string;
}) {
  const width = (value: number) => `${Math.max(2, (Math.abs(value) / top) * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          <span className="text-xs text-muted">avg {money(Math.round(avg))} · </span>
          <span className="font-medium">{money(month)}</span>
        </span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1" aria-hidden>
        <div className="h-2 rounded-full bg-sunken">
          <div className={`h-2 rounded-full ${tone}`} style={{ width: width(month) }} />
        </div>
        <div className="h-1 rounded-full bg-sunken">
          <div className="h-1 rounded-full bg-rule-strong" style={{ width: width(avg) }} />
        </div>
      </div>
    </div>
  );
}

function VariantC(props: VariantProps) {
  const { flow, insight, money } = props;
  const { latest, before } = split(flow);
  const avg = {
    income: average(before.map((month) => month.income)),
    expense: average(before.map((month) => month.expense)),
    net: average(before.map((month) => month.net)),
  };
  const top = Math.max(1, latest.income, latest.expense, avg.income, avg.expense);
  return (
    <section
      aria-labelledby="overview-insight"
      className="flex flex-col overflow-hidden rounded-3xl border border-rule bg-surface shadow-lg lg:row-span-2 lg:self-stretch"
    >
      <div className="flex flex-col bg-insight p-6 text-on-hero">
        <h2 id="overview-insight" className="font-display text-3xl leading-tight tracking-tight">
          {insight.headline}
        </h2>
        <Sentence {...props} className="mt-3 max-w-sm text-on-hero/80" />
        <Cta flow={flow} className="mt-5" />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-5 p-5">
        <h3 className="text-sm font-medium">{latest.label} against your average</h3>
        <Compare
          label="Came in"
          month={latest.income}
          avg={avg.income}
          top={top}
          money={money}
          tone="bg-hero-deep"
        />
        <Compare
          label="Went out"
          month={latest.expense}
          avg={avg.expense}
          top={top}
          money={money}
          tone="bg-hero-glow"
        />
        <Compare
          label="Kept"
          month={latest.net}
          avg={avg.net}
          top={top}
          money={money}
          tone={latest.net >= 0 ? 'bg-positive' : 'bg-negative'}
        />
      </div>
    </section>
  );
}

/* ---------- switcher ---------- */

export function InsightCardPrototype({ cards }: { cards: WidgetCardData[] }) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const variant = usePrototypeVariant(VARIANTS);
  const flow = overviewFlow(cards, money);
  const insight = flow ? spendingInsight(flow.months) : null;
  if (!flow || !insight) return <PrototypeSwitcher variants={VARIANTS} />;
  const props = { flow, insight, money };
  return (
    <>
      {variant === 'now' && <InsightCard cards={cards} />}
      {variant === 'A' && <VariantA {...props} />}
      {variant === 'B' && <VariantB {...props} />}
      {variant === 'C' && <VariantC {...props} />}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}

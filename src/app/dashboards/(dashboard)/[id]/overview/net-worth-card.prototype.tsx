'use client';

/*
 * PROTOTYPE, throwaway. Question: what should "Your net worth today" look like once it stands as
 * tall as "Recent activity" (both span the overview row's two rows from `lg` up)?
 * Four variants on the Dashboard route, switched with `?variant=now|A|B|C`:
 *   now  the card as it ships today, for comparison (sits at its own height)
 *   A    Tall line: the running balance grows to fill the card, with a month axis
 *   B    Month ledger: a diverging bar per month of what was kept, filling the height
 *   C    In / out / kept: the totals broken down, then averages, best and worst month
 */

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { PrototypeSwitcher, usePrototypeVariant } from '@/components/prototype-switcher';
import { TILE_CLASS } from '@/components/surface';
import { readCard, type CardFlow, type MonthFlow, type WidgetCardData } from '@/lib/reporting/card';
import { headlineAmount, runningTotals } from '@/lib/reporting/overview';
import { FigureLink } from '../figure-link';
import { NetWorthCard } from './overview-row';

const VARIANTS = [
  { key: 'A', name: 'Tall line' },
  { key: 'B', name: 'Month ledger' },
  { key: 'C', name: 'In / out / kept' },
  { key: 'now', name: 'As shipped' },
];

type Money = (minor: number) => string;

interface Hero {
  label: string;
  value: number;
  href: string;
}

interface VariantProps {
  hero: Hero;
  flow: CardFlow | null;
  money: Money;
}

const TALL = `${TILE_CLASS} bg-gradient-to-br from-hero-mist/30 to-surface flex flex-col lg:row-span-2 self-stretch`;
const short = (label: string) => label.split(' ')[0] ?? label;

function overviewFlow(cards: WidgetCardData[], money: Money): CardFlow | null {
  for (const card of cards) {
    const { flow } = readCard(card, money);
    if (flow) return flow;
  }
  return null;
}

function Headline({ hero, flow, money }: VariantProps) {
  const kept = flow?.months.reduce((total, month) => total + month.net, 0) ?? 0;
  return (
    <div>
      <h2 id="overview-headline" className="font-medium">
        {hero.label}
      </h2>
      <Link
        href={hero.href}
        className="mt-4 block font-display text-4xl tracking-tight tabular-nums hover:underline"
      >
        {money(hero.value)}
      </Link>
      {flow && (
        <p className="mt-2 text-sm text-muted">
          <FigureLink href={flow.href} className={kept >= 0 ? 'text-positive' : 'text-negative'}>
            <span aria-hidden>{kept >= 0 ? '↗' : '↘'}</span> {money(kept)}
          </FigureLink>{' '}
          kept over {flow.months.length} months
        </p>
      )}
    </div>
  );
}

/* ---------- now: as shipped ---------- */

function VariantNow({ cards }: { cards: WidgetCardData[] }) {
  return <NetWorthCard cards={cards} />;
}

/* ---------- A: tall line ---------- */

function TallLine({ months, money }: { months: MonthFlow[]; money: Money }) {
  const points = runningTotals(months.map((month) => month.net));
  if (points.length < 2) return <div className="flex-1" />;
  const min = Math.min(0, ...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  // Percent coordinates, so the line stretches to whatever height the card is given.
  const x = (i: number) => (i / (points.length - 1)) * 96 + 2;
  const y = (v: number) => 92 - ((v - min) / range) * 84;
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},100 L${x(0)},100 Z`;
  const last = points.at(-1)!;
  return (
    <figure className="mt-6 flex min-h-48 flex-1 flex-col">
      <div className="relative flex-1">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {[8, 50, 92].map((g) => (
            <line
              key={g}
              x1={0}
              x2={100}
              y1={g}
              y2={g}
              className="stroke-rule"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 4"
            />
          ))}
          <path d={area} className="fill-hero-mist/40" />
          <path
            d={line}
            fill="none"
            className="stroke-hero-mid"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute top-0 left-0 text-xs text-muted tabular-nums">{money(max)}</span>
        <span
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hero-deep ring-4 ring-hero-mist/60"
          style={{ left: `${x(points.length - 1)}%`, top: `${y(last)}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted" aria-hidden>
        {months.map((month, i) => (
          <span key={month.label} className="w-0 flex-1 text-center">
            {i % 2 === 0 || i === months.length - 1 ? short(month.label) : ''}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 text-xs text-muted">
        Running total of what was kept, month by month
      </figcaption>
    </figure>
  );
}

function VariantA({ hero, flow, money }: VariantProps) {
  return (
    <section aria-labelledby="overview-headline" className={TALL}>
      <Headline hero={hero} flow={flow} money={money} />
      {flow ? <TallLine months={flow.months} money={money} /> : <div className="flex-1" />}
    </section>
  );
}

/* ---------- B: month ledger ---------- */

function VariantB({ hero, flow, money }: VariantProps) {
  const months = flow?.months.slice(-8).reverse() ?? [];
  const max = Math.max(1, ...months.map((month) => Math.abs(month.net)));
  return (
    <section aria-labelledby="overview-headline" className={TALL}>
      <Headline hero={hero} flow={flow} money={money} />
      {months.length > 0 && (
        <ol
          aria-label="Kept per month"
          className="mt-5 flex flex-1 flex-col justify-between gap-1 border-t border-rule pt-3"
        >
          {months.map((month) => {
            const width = `${(Math.abs(month.net) / max) * 50}%`;
            const isUp = month.net >= 0;
            return (
              <li
                key={month.label}
                className="grid grid-cols-[3.5rem_1fr_6.5rem] items-center gap-3 text-sm"
              >
                <span className="text-muted">
                  {short(month.label)}
                  {month.isPartial && '*'}
                </span>
                <span className="relative h-3 rounded-full bg-sunken">
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-1/2 w-px bg-rule-strong"
                  />
                  <span
                    className={`absolute top-0 bottom-0 rounded-full ${isUp ? 'left-1/2 bg-hero-mid' : 'right-1/2 bg-negative-tint ring-1 ring-negative/40'} ${month.isPartial ? 'opacity-50' : ''}`}
                    style={{ width }}
                  />
                </span>
                <span className={`text-right tabular-nums ${isUp ? 'text-ink' : 'text-negative'}`}>
                  {isUp ? '+' : ''}
                  {money(month.net)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">Kept each month, newest first · * still running</p>
    </section>
  );
}

/* ---------- C: in / out / kept ---------- */

function Stat({
  label,
  value,
  share,
  tone,
}: {
  label: string;
  value: string;
  share: number;
  tone: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-sunken">
        <div
          className={`h-2 rounded-full ${tone}`}
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>
    </div>
  );
}

function VariantC({ hero, flow, money }: VariantProps) {
  const months = flow?.months ?? [];
  const income = months.reduce((t, m) => t + m.income, 0);
  const expense = months.reduce((t, m) => t + m.expense, 0);
  const kept = income - expense;
  const top = Math.max(1, income, expense);
  const full = months.filter((m) => !m.isPartial);
  const best = full.reduce<MonthFlow | null>((b, m) => (!b || m.net > b.net ? m : b), null);
  const worst = full.reduce<MonthFlow | null>((w, m) => (!w || m.net < w.net ? m : w), null);
  const average = full.length ? full.reduce((t, m) => t + m.net, 0) / full.length : 0;
  const savingsRate = income > 0 ? kept / income : 0;
  return (
    <section aria-labelledby="overview-headline" className={TALL}>
      <Headline hero={hero} flow={flow} money={money} />
      {flow && (
        <>
          <div className="mt-6 flex flex-col gap-4">
            <Stat label="Came in" value={money(income)} share={income / top} tone="bg-hero-deep" />
            <Stat
              label="Went out"
              value={money(expense)}
              share={expense / top}
              tone="bg-hero-glow"
            />
            <Stat
              label="Kept"
              value={money(kept)}
              share={Math.abs(kept) / top}
              tone={kept >= 0 ? 'bg-positive' : 'bg-negative'}
            />
          </div>
          <dl className="mt-auto grid grid-cols-2 gap-3 pt-6 text-sm">
            <div className="rounded-2xl bg-paper p-3">
              <dt className="text-xs text-muted">Kept per month</dt>
              <dd className="mt-1 font-display text-xl tabular-nums">
                {money(Math.round(average))}
              </dd>
            </div>
            <div className="rounded-2xl bg-paper p-3">
              <dt className="text-xs text-muted">Savings rate</dt>
              <dd className="mt-1 font-display text-xl tabular-nums">
                {Math.round(savingsRate * 100)}%
              </dd>
            </div>
            {best && (
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-xs text-muted">Best month</dt>
                <dd className="mt-1 tabular-nums">
                  {short(best.label)} · <span className="text-positive">{money(best.net)}</span>
                </dd>
              </div>
            )}
            {worst && (
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-xs text-muted">Leanest month</dt>
                <dd className="mt-1 tabular-nums">
                  {short(worst.label)} ·{' '}
                  <span className={worst.net < 0 ? 'text-negative' : ''}>{money(worst.net)}</span>
                </dd>
              </div>
            )}
          </dl>
        </>
      )}
    </section>
  );
}

/* ---------- switcher ---------- */

export function NetWorthCardPrototype({ cards }: { cards: WidgetCardData[] }) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const variant = usePrototypeVariant(VARIANTS);
  const hero = headlineAmount(cards);
  if (!hero) return <PrototypeSwitcher variants={VARIANTS} />;
  const props = { hero, flow: overviewFlow(cards, money), money };
  return (
    <>
      {variant === 'now' && <VariantNow cards={cards} />}
      {variant === 'A' && <VariantA {...props} />}
      {variant === 'B' && <VariantB {...props} />}
      {variant === 'C' && <VariantC {...props} />}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}

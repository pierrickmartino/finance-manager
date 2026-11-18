'use client';
/**
 * PROTOTYPE (Tremor redesign) Dashboard B, "Report tabs": a narrative report, not a grid. One
 * reading column: a sentence headline, the net worth split as a CategoryBar, then Tremor Tabs
 * (Spending / Income / Net worth) each holding one big chart and its commentary, then a
 * 90-day Tracker and a plain activity list. Few cards; dividers instead. Throwaway.
 */
import Link from 'next/link';
import { AreaChart } from '@/components/tremor-prototype/AreaChart';
import { BarChart } from '@/components/tremor-prototype/BarChart';
import { Callout } from '@/components/tremor-prototype/Callout';
import { CategoryBar } from '@/components/tremor-prototype/CategoryBar';
import { Divider } from '@/components/tremor-prototype/Divider';
import { DonutChart } from '@/components/tremor-prototype/DonutChart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/tremor-prototype/Tabs';
import { Tracker } from '@/components/tremor-prototype/Tracker';
import {
  change,
  compactMoney,
  money,
  money0,
  pct,
  shortDate,
} from '@/components/tremor-prototype/format';
import type { ProtoDashboard } from '@/server/prototype-tremor-data';

const KINDS = [
  { key: 'current', label: 'Current', color: 'navy', dot: 'bg-hero-mid' },
  { key: 'savings', label: 'Savings', color: 'glow', dot: 'bg-hero-glow' },
  { key: 'pillar', label: 'Pillar 3a', color: 'mist', dot: 'bg-hero-mist' },
] as const;

const DONUT_COLORS = ['s1', 's2', 's3', 's4', 's5', 's6', 'rule'] as const;

function trackerColor(value: number, max: number) {
  if (value === 0) return 'bg-sunken';
  const r = value / max;
  if (r > 0.6) return 'bg-hero-deep';
  if (r > 0.3) return 'bg-hero-mid';
  if (r > 0.12) return 'bg-hero-glow';
  return 'bg-hero-mist';
}

export function DashboardB({ data, name }: { data: ProtoDashboard; name: string }) {
  const m = data.months;
  const now = m.at(-1)!;
  const prev = m.at(-2)!;
  const yearAgo = m.at(-13)!;
  const last12 = m.slice(-12);
  const growth = now.netWorth - yearAgo.netWorth;
  const totalKinds = KINDS.reduce((s, k) => s + Math.max(0, now[k.key]), 0);
  const top = data.categories.slice(0, 6);
  const other = data.categories.slice(6).reduce((s, c) => s + c.year, 0);
  const donut = [
    ...top.map((c) => ({ name: c.name, value: c.year })),
    { name: 'Other', value: other },
  ];
  const yearSpend = data.categories.reduce((s, c) => s + c.year, 0);
  const maxDay = Math.max(...data.daily.map((d) => d.expense), 1);
  const biggestRise = [...data.categories].sort(
    (a, b) => b.thisMonth - b.lastMonth - (a.thisMonth - a.lastMonth),
  )[0];

  return (
    <article className="mx-auto flex max-w-3xl flex-col">
      <p className="text-sm text-muted">{name} · as of today</p>
      <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight text-pretty text-ink md:text-5xl">
        You are worth <span className="tabular-nums">{money0(now.netWorth)}</span>,{' '}
        <span className={growth >= 0 ? 'text-positive' : 'text-negative'}>
          {growth >= 0 ? 'up' : 'down'} {money0(Math.abs(growth))}
        </span>{' '}
        on a year ago.
      </h1>

      <div className="mt-8">
        <CategoryBar
          values={KINDS.map((k) => Math.round((Math.max(0, now[k.key]) / totalKinds) * 100))}
          colors={KINDS.map((k) => k.color)}
          showLabels={false}
        />
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {KINDS.map((k) => (
            <li key={k.key} className="flex items-center gap-2 text-ink-soft">
              <span aria-hidden="true" className={`size-2.5 rounded-sm ${k.dot}`} />
              {k.label}{' '}
              <span className="font-medium tabular-nums text-ink">{money0(now[k.key])}</span>
            </li>
          ))}
        </ul>
      </div>

      {data.unclassifiedCount > 0 && (
        <Callout
          title={`${data.unclassifiedCount} Transactions need a Category`}
          variant="warning"
          className="mt-8"
        >
          The spending below leaves them out until they are classified.{' '}
          <Link href="/unclassified" className="font-medium underline">
            Review them
          </Link>
        </Callout>
      )}

      <Tabs defaultValue="spending" className="mt-10">
        <TabsList>
          <TabsTrigger value="spending">Spending</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="networth">Net worth</TabsTrigger>
        </TabsList>

        <TabsContent value="spending" className="pt-6">
          <p className="text-ink-soft">
            You spent <strong className="text-ink">{money0(now.expense)}</strong> so far this month,
            against {money0(prev.expense)} in {prev.label}.
            {biggestRise && biggestRise.thisMonth > biggestRise.lastMonth && (
              <>
                {' '}
                The biggest rise is <strong className="text-ink">{biggestRise.name}</strong> (
                {money0(biggestRise.thisMonth - biggestRise.lastMonth)} more).
              </>
            )}
          </p>
          <BarChart
            className="mt-6 h-64"
            data={last12}
            index="label"
            categories={['expense']}
            colors={['navy']}
            valueFormatter={compactMoney}
            yAxisWidth={64}
            showLegend={false}
          />
          <Divider>Last 12 months by category</Divider>
          <div className="grid items-center gap-8 sm:grid-cols-[12rem_1fr]">
            <DonutChart
              data={donut}
              category="name"
              value="value"
              colors={[...DONUT_COLORS]}
              valueFormatter={money0}
              showLabel
              label={compactMoney(yearSpend)}
              className="mx-auto size-48"
            />
            <ul className="divide-y divide-rule text-sm">
              {donut.map((c, i) => (
                <li key={c.name} className="flex items-center gap-3 py-2">
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-sm ${['bg-[#2a78d6]', 'bg-[#eb6834]', 'bg-[#1baf7a]', 'bg-[#eda100]', 'bg-[#e87ba4]', 'bg-[#008300]', 'bg-rule-strong'][i]}`}
                  />
                  <span className="text-ink">{c.name}</span>
                  <span className="ml-auto tabular-nums text-ink">{money0(c.value)}</span>
                  <span className="w-12 text-right text-muted tabular-nums">
                    {Math.round((c.value / yearSpend) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="income" className="pt-6">
          <p className="text-ink-soft">
            In {prev.label} you earned <strong className="text-ink">{money0(prev.income)}</strong>{' '}
            and kept <strong className="text-ink">{money0(prev.income - prev.expense)}</strong>.
          </p>
          <AreaChart
            className="mt-6 h-72"
            data={last12}
            index="label"
            categories={['income', 'expense']}
            colors={['navy', 'amber']}
            valueFormatter={compactMoney}
            yAxisWidth={64}
            fill="gradient"
          />
        </TabsContent>

        <TabsContent value="networth" className="pt-6">
          <p className="text-ink-soft">
            {pct(change(now.netWorth, yearAgo.netWorth))} over twelve months,{' '}
            {pct(change(now.netWorth, m[0]!.netWorth))} over two years.
          </p>
          <AreaChart
            className="mt-6 h-72"
            data={m}
            index="label"
            categories={['netWorth']}
            colors={['deep']}
            valueFormatter={compactMoney}
            yAxisWidth={72}
            showLegend={false}
            autoMinValue
          />
        </TabsContent>
      </Tabs>

      <Divider className="mt-10" />
      <section>
        <h2 className="font-display text-2xl tracking-tight text-ink">The last 90 days</h2>
        <p className="mt-1 text-sm text-muted">Each block is a day; darker means more was spent.</p>
        <Tracker
          className="mt-4 h-10"
          data={data.daily.map((d) => ({
            key: d.date,
            color: trackerColor(d.expense, maxDay),
            tooltip: `${shortDate(d.date)}: ${money0(d.expense)}`,
          }))}
        />
        <div className="mt-1.5 flex justify-between text-xs text-muted">
          <span>{shortDate(data.daily[0]!.date)}</span>
          <span>Today</span>
        </div>
      </section>

      <Divider className="mt-10" />
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl tracking-tight text-ink">What changed recently</h2>
          <Link href="/transactions" className="text-sm text-accent-ink hover:underline">
            Every Transaction
          </Link>
        </div>
        <ul className="mt-4 divide-y divide-rule">
          {data.recent.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-baseline gap-4 py-3">
              <span className="w-14 shrink-0 text-sm text-muted">{shortDate(t.date)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {t.payee ?? t.description}
                <span className="ml-2 text-sm text-muted">{t.category ?? 'Unclassified'}</span>
              </span>
              <span className={`tabular-nums ${t.amount > 0 ? 'text-positive' : 'text-ink'}`}>
                {money(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

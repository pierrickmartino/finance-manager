'use client';
/**
 * PROTOTYPE (Tremor redesign) Dashboard C, "Icon rail + inspector": a dense watchlist, like a
 * trading terminal. A strip of inline figures (no cards), then every expense Category as a row
 * with its month, its change and a 12-month spark bar; selecting a row (or an Account) fills the
 * inspector on the right with that thing's chart and figures. Throwaway.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/tremor-prototype/Badge';
import { BarChart } from '@/components/tremor-prototype/BarChart';
import { AreaChart } from '@/components/tremor-prototype/AreaChart';
import { ProgressBar } from '@/components/tremor-prototype/ProgressBar';
import { SparkBarChart, SparkLineChart } from '@/components/tremor-prototype/SparkChart';
import { cx } from '@/components/tremor-prototype/cx';
import { change, compactMoney, money, money0, pct } from '@/components/tremor-prototype/format';
import type { ProtoDashboard } from '@/server/prototype-tremor-data';

type Selection =
  { kind: 'category'; id: string } | { kind: 'account'; id: string } | { kind: 'networth' };

function Figure({
  label,
  value,
  delta,
  inverse,
}: {
  label: string;
  value: string;
  delta?: number;
  inverse?: boolean;
}) {
  const good = delta === undefined ? true : inverse ? delta <= 0 : delta >= 0;
  return (
    <div className="min-w-36 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-ink">{value}</span>
        {delta !== undefined && (
          <span className={cx('text-xs tabular-nums', good ? 'text-positive' : 'text-negative')}>
            {pct(delta)}
          </span>
        )}
      </p>
    </div>
  );
}

export function DashboardC({ data, name }: { data: ProtoDashboard; name: string }) {
  const m = data.months;
  const now = m.at(-1)!;
  const prev = m.at(-2)!;
  const last12 = m.slice(-12);
  const [sel, setSel] = useState<Selection>({ kind: 'networth' });
  const maxYear = data.categories[0]?.year ?? 1;
  const months12 = last12.map((x) => x.label);

  const rowClass = (active: boolean) =>
    cx(
      'grid w-full grid-cols-[minmax(0,1.4fr)_6rem_5rem_7rem_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-left text-sm',
      active ? 'bg-accent-tint' : 'hover:bg-sunken',
    );

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap divide-x divide-rule rounded-lg border border-rule bg-surface">
          <button
            type="button"
            onClick={() => setSel({ kind: 'networth' })}
            className={cx('text-left', sel.kind === 'networth' && 'bg-accent-tint')}
          >
            <Figure
              label="Net worth"
              value={money0(now.netWorth)}
              delta={change(now.netWorth, m.at(-13)!.netWorth)}
            />
          </button>
          <Figure
            label={`Income ${prev.label}`}
            value={money0(prev.income)}
            delta={change(prev.income, m.at(-3)!.income)}
          />
          <Figure
            label={`Spent ${now.label}`}
            value={money0(now.expense)}
            delta={change(now.expense, prev.expense)}
            inverse
          />
          <Figure label={`Saved ${prev.label}`} value={money0(prev.income - prev.expense)} />
          <Link href="/unclassified" className="px-4 py-3 hover:bg-sunken">
            <p className="text-xs text-muted">Unclassified</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-warning">
              {data.unclassifiedCount}
            </p>
          </Link>
          <p className="ml-auto self-center px-4 text-xs text-muted">{name}</p>
        </div>

        <section className="overflow-hidden rounded-lg border border-rule bg-surface">
          <header className="flex items-center justify-between border-b border-rule px-3 py-2">
            <h2 className="text-sm font-semibold text-ink">Spending watchlist</h2>
            <p className="text-xs text-muted">{data.categories.length} Categories · click a row</p>
          </header>
          <div className="grid grid-cols-[minmax(0,1.4fr)_6rem_5rem_7rem_minmax(0,1fr)] gap-3 border-b border-rule bg-paper px-3 py-1.5 text-xs text-muted">
            <span>Category</span>
            <span className="text-right">{now.label}</span>
            <span className="text-right">vs. last</span>
            <span>12 months</span>
            <span>Share of the year</span>
          </div>
          <ul className="divide-y divide-rule">
            {data.categories.map((c) => {
              const d = change(c.thisMonth, c.lastMonth);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSel({ kind: 'category', id: c.id })}
                    className={rowClass(sel.kind === 'category' && sel.id === c.id)}
                  >
                    <span className="truncate">
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="ml-2 text-xs text-muted">{c.group}</span>
                    </span>
                    <span className="text-right tabular-nums text-ink">{money0(c.thisMonth)}</span>
                    <span className="text-right">
                      {c.lastMonth ? (
                        <Badge variant={d <= 0 ? 'success' : 'error'}>{pct(d)}</Badge>
                      ) : (
                        <span className="text-xs text-faint">new</span>
                      )}
                    </span>
                    <SparkBarChart
                      data={c.series.map((v, i) => ({ i, v }))}
                      index="i"
                      categories={['v']}
                      colors={['navy']}
                      className="h-6 w-28"
                    />
                    <span className="flex items-center gap-2">
                      <ProgressBar value={(c.year / maxYear) * 100} className="flex-1" />
                      <span className="w-20 text-right text-xs tabular-nums text-muted">
                        {money0(c.year)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="overflow-hidden rounded-lg border border-rule bg-surface">
          <header className="border-b border-rule px-3 py-2">
            <h2 className="text-sm font-semibold text-ink">Accounts</h2>
          </header>
          <ul className="divide-y divide-rule">
            {data.accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSel({ kind: 'account', id: a.id })}
                  className={cx(
                    'grid w-full grid-cols-[minmax(0,1fr)_6rem_10rem_8rem] items-center gap-3 px-3 py-2 text-left text-sm',
                    sel.kind === 'account' && sel.id === a.id
                      ? 'bg-accent-tint'
                      : 'hover:bg-sunken',
                  )}
                >
                  <span className="truncate font-medium text-ink">
                    {a.name} <span className="font-normal text-muted">· {a.bank}</span>
                  </span>
                  <Badge variant="neutral" className="justify-self-start">
                    {a.kind}
                  </Badge>
                  <SparkLineChart
                    data={a.series.map((v, i) => ({ i, v }))}
                    index="i"
                    categories={['v']}
                    colors={['navy']}
                    className="h-6 w-36"
                    autoMinValue
                  />
                  <span className="text-right font-medium tabular-nums text-ink">
                    {money0(a.balance)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Inspector data={data} sel={sel} months12={months12} />
    </div>
  );
}

function Inspector({
  data,
  sel,
  months12,
}: {
  data: ProtoDashboard;
  sel: Selection;
  months12: string[];
}) {
  const box =
    'sticky top-16 flex flex-col gap-4 self-start rounded-lg border border-rule bg-surface p-4';
  if (sel.kind === 'category') {
    const c = data.categories.find((x) => x.id === sel.id)!;
    const series = c.series.map((v, i) => ({ month: months12[i], spent: v }));
    const avg = c.year / 12;
    return (
      <aside className={box} aria-label="Inspector">
        <div>
          <p className="text-xs text-muted">{c.group}</p>
          <h2 className="font-display text-2xl tracking-tight text-ink">{c.name}</h2>
        </div>
        <BarChart
          data={series}
          index="month"
          categories={['spent']}
          colors={['navy']}
          valueFormatter={compactMoney}
          showLegend={false}
          yAxisWidth={56}
          className="h-48"
        />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">This month</dt>
            <dd className="font-medium tabular-nums">{money(c.thisMonth)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last month</dt>
            <dd className="font-medium tabular-nums">{money(c.lastMonth)}</dd>
          </div>
          <div>
            <dt className="text-muted">Monthly average</dt>
            <dd className="font-medium tabular-nums">{money(avg)}</dd>
          </div>
          <div>
            <dt className="text-muted">12 months</dt>
            <dd className="font-medium tabular-nums">{money(c.year)}</dd>
          </div>
        </dl>
        <Link
          href={`/transactions?category=${encodeURIComponent(c.name)}`}
          className="rounded-md bg-ink px-3 py-2 text-center text-sm font-medium text-paper hover:bg-ink-hover"
        >
          Open its Transactions
        </Link>
      </aside>
    );
  }
  if (sel.kind === 'account') {
    const a = data.accounts.find((x) => x.id === sel.id)!;
    const series = a.series.map((v, i) => ({ month: data.months[i]!.label, balance: v }));
    return (
      <aside className={box} aria-label="Inspector">
        <div>
          <p className="text-xs text-muted">
            {a.bank} · {a.kind}
          </p>
          <h2 className="font-display text-2xl tracking-tight text-ink">{a.name}</h2>
          <p className="mt-1 font-display text-3xl tabular-nums text-ink">{money(a.balance)}</p>
        </div>
        <AreaChart
          data={series}
          index="month"
          categories={['balance']}
          colors={['navy']}
          valueFormatter={compactMoney}
          showLegend={false}
          yAxisWidth={56}
          className="h-48"
          autoMinValue
        />
        <Link
          href={`/accounts/${a.id}`}
          className="rounded-md bg-ink px-3 py-2 text-center text-sm font-medium text-paper hover:bg-ink-hover"
        >
          Open the Account
        </Link>
      </aside>
    );
  }
  const m = data.months;
  return (
    <aside className={box} aria-label="Inspector">
      <div>
        <p className="text-xs text-muted">Every Account, month-end</p>
        <h2 className="font-display text-2xl tracking-tight text-ink">Net worth</h2>
        <p className="mt-1 font-display text-3xl tabular-nums text-ink">
          {money0(m.at(-1)!.netWorth)}
        </p>
      </div>
      <AreaChart
        data={m}
        index="label"
        categories={['current', 'savings', 'pillar']}
        colors={['navy', 'glow', 'mist']}
        type="stacked"
        valueFormatter={compactMoney}
        yAxisWidth={56}
        className="h-56"
        fill="solid"
      />
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          ['1M', -2],
          ['1Y', -13],
          ['2Y', 0],
        ].map(([label, idx]) => {
          const then = idx === 0 ? m[0]! : m.at(idx as number)!;
          const d = change(m.at(-1)!.netWorth, then.netWorth);
          return (
            <div key={label as string} className="rounded-md bg-sunken px-2 py-1.5">
              <dt className="text-xs text-muted">{label}</dt>
              <dd
                className={cx(
                  'font-medium tabular-nums',
                  d >= 0 ? 'text-positive' : 'text-negative',
                )}
              >
                {pct(d)}
              </dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}

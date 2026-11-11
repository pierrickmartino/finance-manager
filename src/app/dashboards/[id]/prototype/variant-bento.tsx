'use client';

/**
 * PROTOTYPE (throwaway) — Variant B, "Teal bento": the reference screenshot's structure.
 * A deep teal hero band (greeting, pill tabs, actions) over a three-column bento of cards:
 * net worth + sparkline, a dot-matrix cash flow, an insight card, where the money goes,
 * recent activity and a monthly performance bar chart with a hatched highlight.
 * Colours are local to this file on purpose: adopting them would mean new design tokens.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import type { Dashboard } from '@/server/services/dashboards';
import {
  compact,
  greeting,
  headlineInsight,
  monthOverMonth,
  type DashboardFigures,
  type FlowMonth,
  type RecentActivity,
} from './prototype-data';

const TEAL = {
  deep: '#0b3a4a',
  mid: '#1d5f73',
  soft: '#9cc3cf',
  pale: '#dbe9ee',
  mist: '#eef4f6',
  ink: '#0f2a33',
};

export interface VariantProps {
  dashboard: { id: string; name: string };
  dashboards: Dashboard[];
  figures: DashboardFigures;
  activity: RecentActivity[];
  editHref: string;
}

const CARD = 'rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 200;
  const h = 90;
  const pts = values.map((value, i): [number, number] => [
    (i / (values.length - 1)) * w,
    h - 8 - ((value - min) / span) * (h - 16),
  ]);
  const d = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = pts[i - 1]!;
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    })
    .join(' ');
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" aria-hidden>
      {values.map((_, i) => (
        <line
          key={i}
          x1={(i / (values.length - 1)) * w}
          x2={(i / (values.length - 1)) * w}
          y1={0}
          y2={h}
          stroke={TEAL.pale}
          strokeWidth={0.6}
        />
      ))}
      <path d={d} fill="none" stroke={TEAL.mid} strokeWidth={3} strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={7} fill={TEAL.soft} opacity={0.6} />
      <circle cx={lx} cy={ly} r={4} fill={TEAL.mid} />
    </svg>
  );
}

/** The screenshot's dot grid: each month a column of dots, the coloured ones reach its value. */
function DotMatrix({ months }: { months: FlowMonth[] }) {
  const ROWS = 14;
  const max = Math.max(1, ...months.map((month) => Math.max(month.income, month.expense)));
  const cols = months.length * 2;
  const w = 100 + cols * 18;
  const h = ROWS * 14 + 24;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full" role="img" aria-label="Monthly flow">
      {[0, 0.5, 1].map((share) => (
        <text
          key={share}
          x={0}
          y={8 + (1 - share) * (ROWS - 1) * 14 + 4}
          fontSize={10}
          fill="#7c8b91"
        >
          {compact(max * share)}
        </text>
      ))}
      {months.map((month, m) =>
        (['income', 'expense'] as const).map((kind, k) => {
          const filled = Math.round((month[kind] / max) * ROWS);
          const x = 60 + (m * 2 + k) * 18;
          return (
            <g key={`${m}-${kind}`}>
              {Array.from({ length: ROWS }, (_, r) => {
                const fromBottom = ROWS - 1 - r;
                const isOn = fromBottom < filled;
                const isTop = fromBottom === filled - 1;
                return (
                  <circle
                    key={r}
                    cx={x}
                    cy={8 + r * 14}
                    r={isTop ? 4.6 : 4}
                    fill={
                      !isOn
                        ? '#e7edef'
                        : isTop
                          ? kind === 'income'
                            ? TEAL.deep
                            : TEAL.mid
                          : kind === 'income'
                            ? TEAL.soft
                            : TEAL.pale
                    }
                  />
                );
              })}
              {k === 0 && (
                <text x={x + 9} y={h - 2} fontSize={10} fill="#7c8b91" textAnchor="middle">
                  {month.label.split(' ')[0]}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}

function Meter({ share }: { share: number }) {
  const on = Math.round(share * 12);
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="h-4 w-[5px] rounded-full"
          style={{ background: i < on ? TEAL.mid : TEAL.pale }}
        />
      ))}
    </span>
  );
}

type Measure = 'income' | 'expense' | 'net';

function PerformanceBars({ months }: { months: FlowMonth[] }) {
  const fmt = useFormatter();
  const [measure, setMeasure] = useState<Measure>('income');
  const recent = months.slice(-6);
  const values = recent.map((month) => month[measure]);
  const max = Math.max(1, ...values.map(Math.abs));
  const top = values.indexOf(Math.max(...values));
  return (
    <div className={`${CARD} flex flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Monthly performance</h2>
          <p className="text-xs text-[#7c8b91]">Income, spending and what you kept.</p>
        </div>
        <select
          value={measure}
          onChange={(event) => setMeasure(event.target.value as Measure)}
          className="rounded-full border border-[#dbe3e6] bg-white px-3 py-1.5 text-sm"
        >
          <option value="income">Income</option>
          <option value="expense">Spending</option>
          <option value="net">Kept</option>
        </select>
      </div>
      <div className="mt-6 flex h-52 items-end gap-3">
        {recent.map((month, i) => {
          const isTop = i === top;
          const height = `${Math.max(4, (Math.abs(values[i]!) / max) * 100)}%`;
          return (
            <div key={month.key} className="flex h-full flex-1 flex-col items-center justify-end">
              {isTop && (
                <span className="mb-2 rounded-md bg-[#0f1a1e] px-2 py-1 text-[10px] whitespace-nowrap text-white">
                  {fmt.amount(values[i]!, { currency: 'CHF', isWhole: true })}
                </span>
              )}
              <div
                className="w-full rounded-xl"
                style={{
                  height,
                  background: isTop
                    ? `repeating-linear-gradient(135deg, ${TEAL.deep} 0 3px, #ffffff 3px 6px)`
                    : i % 2 === 0
                      ? TEAL.pale
                      : '#e5eaec',
                  border: isTop ? `2px solid ${TEAL.deep}` : undefined,
                }}
              />
              <span className="mt-2 text-xs text-[#7c8b91]">{month.label.split(' ')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function VariantBento({ dashboard, dashboards, figures, activity, editHref }: VariantProps) {
  const fmt = useFormatter();
  const money = (minor: number) =>
    fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true });
  const { months } = figures;
  const insight = headlineInsight(months);
  const netChange = monthOverMonth(months, (month) => month.net);
  const cumulative = months.reduce<number[]>(
    (acc, month) => [...acc, (acc.at(-1) ?? 0) + month.net],
    [],
  );
  const spentTotal = figures.spending.reduce((total, part) => total + part.value, 0);
  const lastMonth = months.at(-1);

  return (
    <div
      className="relative isolate overflow-hidden rounded-[32px] bg-[#f1f5f6] p-4 md:p-6"
      style={{ colorScheme: 'light', color: TEAL.ink }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[23rem]"
        style={{
          background: `radial-gradient(60% 90% at 85% 0%, ${TEAL.soft}66, transparent 70%), radial-gradient(50% 80% at 10% 100%, ${TEAL.mid}, transparent 70%), linear-gradient(165deg, #072b37, ${TEAL.deep} 55%, ${TEAL.mid})`,
          maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
        }}
      />
      {/* Hero band */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-white">
        <p className="font-display text-xl">{dashboard.name}</p>
        <nav aria-label="Dashboards" className="flex flex-wrap gap-2">
          {dashboards.map((item) => (
            <Link
              key={item.id}
              href={`/dashboards/${item.id}?variant=B`}
              aria-current={item.id === dashboard.id ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-sm ${item.id === dashboard.id ? 'bg-white/20' : 'bg-white/5 text-white/75 hover:bg-white/10'}`}
            >
              {item.name}
            </Link>
          ))}
          <Link
            href="/dashboards"
            className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/75 hover:bg-white/10"
          >
            Manage
          </Link>
        </nav>
      </div>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-6 text-white">
        <div>
          <h1 className="text-4xl tracking-tight md:text-5xl">{greeting()}.</h1>
          <p className="mt-3 max-w-md text-white/75">
            Where you stand, how the money moved this year, and what changed since last month.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={editHref}
            className="rounded-full border border-white/60 px-5 py-2.5 text-sm hover:bg-white/10"
          >
            Edit dashboard
          </Link>
          {figures.transactionsHref && (
            <Link
              href={figures.transactionsHref}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-medium"
              style={{ color: TEAL.deep }}
            >
              See transactions
            </Link>
          )}
        </div>
      </div>

      {/* Bento */}
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          {figures.netWorth && (
            <div className={CARD}>
              <p className="flex items-center gap-3 font-medium">
                <span
                  className="grid h-10 w-10 place-items-center rounded-2xl"
                  style={{ background: TEAL.mist }}
                >
                  ◈
                </span>
                {figures.netWorth.label}
              </p>
              <div className="mt-4 grid grid-cols-[auto_1fr] items-end gap-4">
                <div>
                  <Link
                    href={figures.netWorth.href}
                    className="text-4xl tracking-tight tabular-nums"
                  >
                    {money(figures.netWorth.value)}
                  </Link>
                  {netChange && (
                    <p className="mt-2 text-xs text-[#7c8b91]">
                      {netChange.change >= 0 ? '↗' : '↘'} {money(netChange.latest.net)} kept in{' '}
                      {netChange.latest.label}, {netChange.change >= 0 ? 'more' : 'less'} than{' '}
                      {netChange.previous.label}
                    </p>
                  )}
                </div>
                <Sparkline values={cumulative.slice(-7)} />
              </div>
            </div>
          )}
          <div className={CARD}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Where your money goes</h2>
                <p className="text-xs text-[#7c8b91]">{money(spentTotal)} spent this period</p>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {figures.spending.slice(0, 5).map((part) => (
                <li
                  key={`${part.group}-${part.name}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#f6f8f9] px-4 py-3"
                >
                  <div className="min-w-0">
                    {part.href ? (
                      <Link href={part.href} className="block truncate hover:underline">
                        {part.name}
                      </Link>
                    ) : (
                      <span className="block truncate">{part.name}</span>
                    )}
                    <span className="text-xs text-[#7c8b91]">
                      {part.group !== part.name ? `${part.group} · ` : ''}
                      {money(part.value)}
                    </span>
                  </div>
                  <span className="flex items-center gap-3">
                    <Meter share={spentTotal ? part.value / spentTotal : 0} />
                    <span className="w-9 text-right text-xs tabular-nums">
                      {spentTotal ? Math.round((part.value / spentTotal) * 100) : 0}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className={CARD}>
            <p className="text-xs text-[#7c8b91]">Income and spending, month by month</p>
            {lastMonth && (
              <p className="mt-1 text-2xl tracking-tight tabular-nums">
                {money(lastMonth.net)}{' '}
                <span className="text-sm text-[#7c8b91]">kept in {lastMonth.label}</span>
              </p>
            )}
            <DotMatrix months={months.slice(-6)} />
            <p className="flex gap-4 text-xs text-[#7c8b91]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: TEAL.deep }} /> In
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: TEAL.mid }} /> Out
              </span>
            </p>
          </div>
          <div className={CARD}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Recent activity</h2>
              <Link href="/transactions" className="text-sm text-[#7c8b91] hover:underline">
                View all
              </Link>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {activity.slice(0, 5).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl bg-[#f6f8f9] px-4 py-3"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{ background: TEAL.mid }}
                  >
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/transactions/${item.id}`}
                      className="block truncate hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="text-xs text-[#7c8b91]">
                      {item.detail} · {fmt.date(item.bookingDate)}
                    </span>
                  </span>
                  <span
                    className={`text-sm tabular-nums ${item.amountMinor >= 0 ? 'text-positive' : 'text-negative'}`}
                  >
                    {item.amountMinor >= 0 ? '+' : ''}
                    {fmt.amount(item.amountMinor, { currency: item.currency })}
                  </span>
                </li>
              ))}
              {activity.length === 0 && (
                <li className="text-sm text-[#7c8b91]">No transactions yet.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div
            className="flex min-h-64 flex-col justify-between rounded-[28px] p-7 text-white"
            style={{
              background: `radial-gradient(90% 90% at 80% 70%, ${TEAL.deep}, ${TEAL.mid} 60%, ${TEAL.soft})`,
            }}
          >
            <div>
              <p className="text-2xl tracking-tight">{insight?.title ?? 'Not enough data yet.'}</p>
              <p className="mt-3 text-white/80">
                {insight?.body ?? 'Import two full months to see how they compare.'}
              </p>
            </div>
            <Link
              href={`/dashboards/${dashboard.id}?variant=A`}
              className="mt-6 self-start rounded-full bg-white px-5 py-2.5 text-sm font-medium"
              style={{ color: TEAL.deep }}
            >
              Read the full story
            </Link>
          </div>
          <PerformanceBars months={months} />
        </div>
      </div>
    </div>
  );
}

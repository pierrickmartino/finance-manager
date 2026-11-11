'use client';

/**
 * PROTOTYPE — throwaway. Variant B, "Bento": the inspiration's three-column grid of fixed slots.
 * Net worth with a sparkline, a dot-matrix cash flow, a teal insight callout, where the money
 * goes, recent activity and month-by-month bars with the latest month hatched. It keeps the
 * inspiration's teal for marks, which the design system keeps out of pages today.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { derive, type MonthFlow } from './prototype-derive';
import type { RecentTransaction } from './prototype-recent';
import type { StoryChapter } from './story/chapter';

const CARD = 'rounded-[24px] border border-rule bg-surface/90 p-5 shadow-sm backdrop-blur';
const PILL =
  'rounded-full border border-rule bg-surface px-4 py-1.5 text-sm font-medium text-ink shadow-sm hover:bg-sunken';
const TEAL = ['#0a2f3c', '#1f6577', '#3b8597', '#a9c7cf'] as const;

interface Props {
  dashboardName: string;
  editHref: string;
  chapters: StoryChapter[];
  recent: RecentTransaction[];
}

function useMoney() {
  const fmt = useFormatter();
  return (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
}

/** The cumulative net flow, drawn as a rising line that ends in a dot. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const points = values.map((_, i) => values.slice(0, i + 1).reduce((t, v) => t + v, 0));
  const [min, max] = [Math.min(0, ...points), Math.max(...points)];
  const w = 220;
  const h = 96;
  const x = (i: number) => (i / (points.length - 1)) * (w - 12) + 4;
  const y = (v: number) => h - 8 - ((v - min) / (max - min || 1)) * (h - 20);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" aria-hidden>
      {points.map((_, i) => (
        <line key={i} x1={x(i)} x2={x(i)} y1={4} y2={h - 4} stroke="#e4e4e7" strokeWidth={1} />
      ))}
      <path d={d} fill="none" stroke={TEAL[1]} strokeWidth={3} strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last]!)} r={9} fill={TEAL[3]} opacity={0.5} />
      <circle cx={x(last)} cy={y(points[last]!)} r={5} fill={TEAL[0]} />
    </svg>
  );
}

function NetWorthCard({ chapters }: { chapters: StoryChapter[] }) {
  const money = useMoney();
  const { netWorth, net } = derive(chapters);
  const year = net ? net.months.reduce((total, m) => total + m.value, 0) : null;
  return (
    <div className={`${CARD} bg-gradient-to-br from-[#e8f0f2] to-surface`}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface text-lg shadow-sm">
          ◈
        </span>
        <span className="font-medium">{netWorth ? 'Net worth' : 'Net cash flow'}</span>
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] items-end gap-4">
        <div>
          {netWorth ? (
            <Link
              href={netWorth.href}
              className="font-display text-4xl tracking-tight tabular-nums"
            >
              {money(netWorth.value)}
            </Link>
          ) : (
            <p className="font-display text-4xl tabular-nums">{year != null ? money(year) : '—'}</p>
          )}
          {year != null && (
            <p className="mt-2 text-sm text-muted">
              <span className={year >= 0 ? 'text-positive' : 'text-negative'}>
                {year >= 0 ? '↗' : '↘'} {money(year)}
              </span>{' '}
              kept over 12 months
            </p>
          )}
        </div>
        {net && <Sparkline values={net.months.map((m) => m.value)} />}
      </div>
    </div>
  );
}

/** Each month a pair of dot columns: what came in (dark) and what went out (mist). */
function DotMatrix({ months }: { months: MonthFlow[] }) {
  const money = useMoney();
  const levels = 9;
  const max = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
  const filled = (value: number) => Math.max(1, Math.round((value / max) * levels));
  const column = (value: number, tone: string, key: string) => {
    const n = filled(value);
    return (
      <div key={key} className="flex flex-col-reverse gap-1">
        {Array.from({ length: levels }, (_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{
              background: i < n ? tone : '#eef1f2',
              opacity: i < n ? 0.45 + (0.55 * (i + 1)) / n : 1,
            }}
          />
        ))}
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-end justify-between gap-1">
        {months.map((month) => (
          <div
            key={month.label}
            className="flex gap-0.5"
            title={`${month.label}: in ${money(month.income)}, out ${money(month.expense)}`}
          >
            {column(month.income, TEAL[0], 'in')}
            {column(month.expense, TEAL[2], 'out')}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        {months.map((month, i) => (
          <span key={month.label} className="w-0 flex-1 text-center">
            {i % 2 === 0 ? month.label.split(' ')[0] : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function CashFlowCard({ chapters }: { chapters: StoryChapter[] }) {
  const money = useMoney();
  const { flow } = derive(chapters);
  if (!flow) return null;
  const full = flow.months.filter((m) => !m.isPartial);
  const avgKept = Math.round(full.reduce((t, m) => t + m.net, 0) / Math.max(full.length, 1));
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">Kept per month, on average</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{money(avgKept)}</p>
        </div>
        <span className={PILL}>Last 12 months</span>
      </div>
      <div className="mt-5">
        <DotMatrix months={flow.months} />
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: TEAL[0] }} /> In
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: TEAL[2] }} /> Out
        </span>
      </div>
    </div>
  );
}

function InsightCard({ chapters }: { chapters: StoryChapter[] }) {
  const { insight, flow } = derive(chapters);
  if (!insight) return null;
  return (
    <div
      className="flex min-h-56 flex-col justify-between rounded-[24px] p-6 text-on-hero shadow-lg"
      style={{
        background: `radial-gradient(120% 120% at 100% 100%, ${TEAL[3]} 0%, transparent 45%), radial-gradient(90% 90% at 70% 60%, ${TEAL[0]} 0%, transparent 70%), linear-gradient(135deg, ${TEAL[1]}, ${TEAL[0]})`,
      }}
    >
      <div>
        <p className="font-display text-3xl leading-tight tracking-tight">{insight.headline}</p>
        <p className="mt-3 max-w-sm text-on-hero/80">{insight.detail}</p>
      </div>
      {flow && (
        <Link
          href={flow.href}
          className="mt-6 self-start rounded-full bg-on-hero px-5 py-2.5 text-sm font-medium text-hero shadow-lg hover:bg-on-hero/90"
        >
          See the Transactions
        </Link>
      )}
    </div>
  );
}

function SpendingCard({ chapters, editHref }: { chapters: StoryChapter[]; editHref: string }) {
  const money = useMoney();
  const { spending } = derive(chapters);
  if (!spending) return null;
  const ticks = 12;
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Where your money goes</p>
          <p className="text-xs text-muted">{money(spending.total)} spent in 12 months</p>
        </div>
        <Link href={editHref} className={PILL}>
          Edit
        </Link>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {spending.parts.map((part) => {
          const lit = Math.max(1, Math.round(part.share * ticks));
          const row = (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl bg-paper px-4 py-3 hover:bg-sunken">
              <div className="min-w-0">
                <p className="truncate font-medium">{part.name}</p>
                <p className="truncate text-xs text-muted">
                  {part.group !== part.name ? `${part.group} · ` : ''}
                  {money(part.value)}
                </p>
              </div>
              <div className="flex gap-0.5" aria-hidden>
                {Array.from({ length: ticks }, (_, i) => (
                  <span
                    key={i}
                    className="h-4 w-1.5 rounded-sm"
                    style={{ background: i < lit ? TEAL[1] : '#e4e4e7' }}
                  />
                ))}
              </div>
              <span className="w-10 text-right text-sm tabular-nums">
                {Math.round(part.share * 100)}%
              </span>
            </div>
          );
          return (
            <li key={`${part.group}/${part.name}`}>
              {part.href ? <Link href={part.href}>{row}</Link> : row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MONOGRAM_TONES = ['#0f4352', '#1f6577', '#3b8597', '#52525b', '#047857'];

function RecentCard({ recent }: { recent: RecentTransaction[] }) {
  const fmt = useFormatter();
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <p className="font-medium">Recent activity</p>
        <Link href="/transactions" className="text-sm text-muted hover:text-ink">
          View all
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {recent.map((t) => {
          const tone =
            MONOGRAM_TONES[
              [...t.name].reduce((h, c) => h + c.charCodeAt(0), 0) % MONOGRAM_TONES.length
            ];
          return (
            <li key={t.id}>
              <Link
                href={`/transactions/${t.id}`}
                className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-2.5 hover:bg-sunken"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ background: tone }}
                >
                  {t.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.category} · {fmt.date(t.bookingDate)}
                  </span>
                </span>
                <span
                  className={`text-sm font-medium tabular-nums ${t.amountMinor > 0 ? 'text-positive' : 'text-negative'}`}
                >
                  {t.amountMinor > 0 ? '+' : ''}
                  {fmt.amount(t.amountMinor, { currency: t.currency })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Measure = 'income' | 'expense' | 'net';
const MEASURES: { key: Measure; label: string }[] = [
  { key: 'expense', label: 'Spending' },
  { key: 'income', label: 'Income' },
  { key: 'net', label: 'Kept' },
];

function PerformanceCard({ chapters }: { chapters: StoryChapter[] }) {
  const money = useMoney();
  const { flow } = derive(chapters);
  const [measure, setMeasure] = useState<Measure>('expense');
  if (!flow) return null;
  const months = flow.months.slice(-6);
  const values = months.map((m) => m[measure]);
  const max = Math.max(...values.map(Math.abs), 1);
  const highlight = months.findLastIndex((m) => !m.isPartial);
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Month by month</p>
          <p className="text-xs text-muted">The last six months, latest full month marked.</p>
        </div>
        <select
          value={measure}
          onChange={(event) => setMeasure(event.target.value as Measure)}
          className="rounded-full border border-rule bg-surface px-3 py-1.5 text-sm shadow-sm"
          aria-label="Measure"
        >
          {MEASURES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-6 flex h-56 items-end gap-3">
        {months.map((month, i) => {
          const value = values[i]!;
          const isMarked = i === highlight;
          return (
            <div
              key={month.label}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div className="relative flex w-full flex-1 items-end">
                {isMarked && (
                  <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper">
                    {money(value)}
                  </span>
                )}
                <div
                  className="w-full rounded-xl"
                  title={`${month.label}: ${money(value)}`}
                  style={{
                    height: `${Math.max(4, (Math.abs(value) / max) * 100)}%`,
                    background: isMarked
                      ? `repeating-linear-gradient(135deg, ${TEAL[0]} 0 3px, ${TEAL[2]} 3px 6px)`
                      : value < 0
                        ? '#fde2e7'
                        : i % 2
                          ? '#dbe7ea'
                          : '#ececee',
                  }}
                />
              </div>
              <span className="text-xs text-muted">{month.label.split(' ')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrototypeBento({ dashboardName, editHref, chapters, recent }: Props) {
  const { rest } = derive(chapters);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{dashboardName}</h1>
          <p className="mt-1 text-muted">
            Where you stand, where it went, and what changed this month.
          </p>
        </div>
        <Link href={editHref} className={PILL}>
          Edit Dashboard
        </Link>
      </header>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5">
          <NetWorthCard chapters={chapters} />
          <SpendingCard chapters={chapters} editHref={editHref} />
        </div>
        <div className="flex flex-col gap-5">
          <CashFlowCard chapters={chapters} />
          <RecentCard recent={recent} />
        </div>
        <div className="flex flex-col gap-5">
          <InsightCard chapters={chapters} />
          <PerformanceCard chapters={chapters} />
        </div>
      </div>
      {rest.length > 0 && (
        <p className="text-sm text-muted">
          Also on this Dashboard, without a slot here: {rest.map((c) => c.name).join(', ')}.
        </p>
      )}
    </div>
  );
}

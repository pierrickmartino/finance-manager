'use client';

/**
 * PROTOTYPE (throwaway) — Variant C, "Cockpit": the screenshot's density, the app's own look.
 * A strip of four KPI tiles, then ONE large focus chart you switch with a segmented control
 * (instead of a card per Widget), and a right rail with insights and recent activity.
 * Uses the existing tokens (ink, vermilion accent, paper) only.
 */
import Link from 'next/link';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFormatter } from '@/components/formatter-provider';
import { CARD_CLASS, SECONDARY_BUTTON_CLASS } from '@/components/surface';
import { STORY } from '../story/palette';
import {
  compact,
  headlineInsight,
  monthOverMonth,
  totalOf,
  type FlowMonth,
} from './prototype-data';
import type { VariantProps } from './variant-bento';

function Spark({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const d = values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`,
    )
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke={tone} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi(props: {
  label: string;
  value: string;
  delta?: { text: string; isGood: boolean } | null;
  spark: number[];
  tone?: string;
}) {
  return (
    <div className={`${CARD_CLASS} flex flex-col gap-2 p-4`}>
      <p className="text-sm text-muted">{props.label}</p>
      <p className="font-display text-3xl tracking-tight tabular-nums">{props.value}</p>
      <Spark values={props.spark} tone={props.tone ?? STORY.ink} />
      {props.delta && (
        <p className={`text-xs ${props.delta.isGood ? 'text-positive' : 'text-negative'}`}>
          {props.delta.text}
        </p>
      )}
    </div>
  );
}

type Focus = 'flow' | 'kept' | 'categories' | 'accounts';
const FOCUS_LABEL: Record<Focus, string> = {
  flow: 'In and out',
  kept: 'Kept',
  categories: 'Categories',
  accounts: 'Accounts',
};

const axis = { tick: { fill: STORY.muted, fontSize: 11 }, tickLine: false, axisLine: false };

function FocusChart({ focus, props }: { focus: Focus; props: VariantProps }) {
  const fmt = useFormatter();
  const money = (minor: number) =>
    fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true });
  const { months, spending, accounts } = props.figures;
  const rows = months.map((m: FlowMonth) => ({
    label: m.label.split(' ')[0],
    income: m.income,
    expense: -m.expense,
    net: m.net,
  }));
  const tooltip = {
    formatter: (value: unknown) => money(Number(value)),
    contentStyle: { background: STORY.ink, border: 0, borderRadius: 8, fontSize: 12 },
    labelStyle: { color: STORY.paper },
    itemStyle: { color: STORY.paper },
  };

  if (focus === 'flow' || focus === 'kept')
    return (
      <ResponsiveContainer width="100%" height="100%">
        {focus === 'flow' ? (
          <BarChart data={rows} stackOffset="sign" barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={STORY.rule} />
            <XAxis dataKey="label" {...axis} />
            <YAxis tickFormatter={compact} width={48} {...axis} />
            <Tooltip {...tooltip} cursor={{ fill: '#f4f4f5' }} />
            <Bar dataKey="income" name="In" stackId="a" fill={STORY.ink} radius={[6, 6, 0, 0]} />
            <Bar
              dataKey="expense"
              name="Out"
              stackId="a"
              fill={STORY.accent}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        ) : (
          <AreaChart data={rows}>
            <CartesianGrid vertical={false} stroke={STORY.rule} />
            <XAxis dataKey="label" {...axis} />
            <YAxis tickFormatter={compact} width={48} {...axis} />
            <Tooltip {...tooltip} />
            <Area
              dataKey="net"
              name="Kept"
              type="monotone"
              stroke={STORY.accent}
              strokeWidth={2.5}
              fill={STORY.accent}
              fillOpacity={0.12}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    );

  const parts =
    focus === 'categories'
      ? spending.map((part) => ({ label: part.name, value: part.value, href: part.href }))
      : accounts.map((part) => ({ label: part.label, value: part.value, href: part.href }));
  const max = Math.max(1, ...parts.map((part) => Math.abs(part.value)));
  return (
    <ul className="flex h-full flex-col justify-center gap-3">
      {parts.map((part, i) => (
        <li key={part.label} className="grid grid-cols-[10rem_1fr_7rem] items-center gap-4 text-sm">
          {part.href ? (
            <Link href={part.href} className="truncate hover:underline">
              {part.label}
            </Link>
          ) : (
            <span className="truncate">{part.label}</span>
          )}
          <span className="h-3 rounded-full bg-sunken">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(Math.abs(part.value) / max) * 100}%`,
                background: i === 0 ? STORY.accent : STORY.ink,
              }}
            />
          </span>
          <span className="text-right tabular-nums">{money(part.value)}</span>
        </li>
      ))}
      {parts.length === 0 && <li className="text-muted">Nothing to show yet.</li>}
    </ul>
  );
}

export function VariantCockpit(props: VariantProps) {
  const { dashboard, dashboards, figures, activity, editHref } = props;
  const fmt = useFormatter();
  const money = (minor: number) =>
    fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true });
  const [focus, setFocus] = useState<Focus>('flow');
  const { months } = figures;
  const income = totalOf(months, (m) => m.income);
  const expense = totalOf(months, (m) => m.expense);
  const rate = income > 0 ? (income - expense) / income : null;
  const incomeMoM = monthOverMonth(months, (m) => m.income);
  const expenseMoM = monthOverMonth(months, (m) => m.expense);
  const insight = headlineInsight(months);
  const cumulative = months.reduce<number[]>((acc, m) => [...acc, (acc.at(-1) ?? 0) + m.net], []);
  const pct = (share: number) => `${share >= 0 ? '+' : ''}${fmt.percent(share)} vs. last month`;

  const insights = [
    insight?.body,
    figures.spending[0] &&
      `${figures.spending[0].name} is your largest expense: ${money(figures.spending[0].value)} this period.`,
    figures.accounts[0] &&
      `${Math.round(figures.accounts[0].share * 100)}% of your money sits in ${figures.accounts[0].label}.`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-sunken p-1 text-sm">
          {dashboards.map((item) => (
            <Link
              key={item.id}
              href={`/dashboards/${item.id}?variant=C`}
              className={`rounded-md px-3 py-1 ${item.id === dashboard.id ? 'bg-surface font-medium shadow-sm' : 'text-ink-soft'}`}
            >
              {item.name}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href="/dashboards" className={SECONDARY_BUTTON_CLASS}>
            Manage
          </Link>
          <Link href={editHref} className={SECONDARY_BUTTON_CLASS}>
            Edit Dashboard
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={figures.netWorth?.label ?? 'Net worth'}
          value={figures.netWorth ? money(figures.netWorth.value) : '—'}
          spark={cumulative}
        />
        <Kpi
          label="Income, 12 months"
          value={money(income)}
          spark={months.map((m) => m.income)}
          delta={incomeMoM && { text: pct(incomeMoM.change), isGood: incomeMoM.change >= 0 }}
        />
        <Kpi
          label="Spending, 12 months"
          value={money(expense)}
          spark={months.map((m) => m.expense)}
          tone={STORY.accent}
          delta={expenseMoM && { text: pct(expenseMoM.change), isGood: expenseMoM.change <= 0 }}
        />
        <Kpi
          label="Savings rate"
          value={rate === null ? '—' : `${Math.round(rate * 100)}%`}
          spark={months.map((m) => (m.income ? m.net / m.income : 0))}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={`${CARD_CLASS} flex flex-col p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl tracking-tight">{dashboard.name}</h1>
            <div role="tablist" className="flex rounded-lg border border-rule p-0.5 text-sm">
              {(Object.keys(FOCUS_LABEL) as Focus[]).map((key) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={focus === key}
                  onClick={() => setFocus(key)}
                  className={`rounded-md px-3 py-1 ${focus === key ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-sunken'}`}
                >
                  {FOCUS_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 h-[26rem]">
            <FocusChart focus={focus} props={props} />
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <section className={`${CARD_CLASS} p-5`}>
            <h2 className="text-sm font-medium text-muted">What changed</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {insights.map((text) => (
                <li key={text} className="border-l-2 border-accent pl-3 text-sm leading-relaxed">
                  {text}
                </li>
              ))}
            </ul>
          </section>
          <section className={`${CARD_CLASS} p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted">Recent activity</h2>
              <Link href="/transactions" className="text-xs text-accent-ink hover:underline">
                View all
              </Link>
            </div>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-rule">
                {activity.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">
                      <Link
                        href={`/transactions/${item.id}`}
                        className="block max-w-40 truncate hover:underline"
                      >
                        {item.name}
                      </Link>
                      <span className="text-xs text-muted">{fmt.date(item.bookingDate)}</span>
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${item.amountMinor >= 0 ? 'text-positive' : ''}`}
                    >
                      {fmt.amount(item.amountMinor, { currency: item.currency })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>
  );
}

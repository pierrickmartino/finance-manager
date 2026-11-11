'use client';

/**
 * PROTOTYPE (throwaway) — Variant D, "Month ledger": no card grid at all.
 * The screenshot's "this month at a glance" idea taken to its end: a month rail on the left
 * (each row a mini diverging bar of in/out) drives a statement-like reading pane on the right
 * (the month's three numbers, where the money went, how it compares with the average).
 * Editorial, hairline rules, the serif carries the numbers. Existing tokens only.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { SECONDARY_BUTTON_CLASS } from '@/components/surface';
import { greeting, totalOf } from './prototype-data';
import type { VariantProps } from './variant-bento';

export function VariantLedger({
  dashboard,
  dashboards,
  figures,
  activity,
  editHref,
}: VariantProps) {
  const fmt = useFormatter();
  const money = (minor: number) =>
    fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true });
  const { months } = figures;
  const [selected, setSelected] = useState(Math.max(0, months.length - 1));
  const month = months[selected];
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
  const avgExpense = months.length ? totalOf(months, (m) => m.expense) / months.length : 0;
  const avgNet = months.length ? totalOf(months, (m) => m.net) / months.length : 0;
  const monthActivity = month
    ? activity.filter((item) => fmt.period(item.bookingDate.slice(0, 7)) === month.label)
    : [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div>
          <p className="text-sm text-muted">
            {greeting()}. {dashboards.length > 1 && 'Dashboard: '}
            {dashboards.length > 1 &&
              dashboards.map((item, i) => (
                <span key={item.id}>
                  {i > 0 && ' · '}
                  <Link
                    href={`/dashboards/${item.id}?variant=D`}
                    className={item.id === dashboard.id ? 'text-ink underline' : 'hover:underline'}
                  >
                    {item.name}
                  </Link>
                </span>
              ))}
          </p>
          <h1 className="mt-1 font-display text-5xl tracking-tight">
            {figures.netWorth ? money(figures.netWorth.value) : dashboard.name}
          </h1>
          {figures.netWorth && <p className="text-sm text-muted">{figures.netWorth.label}</p>}
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

      <div className="grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <nav aria-label="Months" className="flex flex-col">
          <p className="mb-2 grid grid-cols-[4.5rem_1fr_6.5rem] text-xs text-muted">
            <span>Month</span>
            <span className="text-center">out · in</span>
            <span className="text-right">kept</span>
          </p>
          {months
            .map((m, i) => ({ m, i }))
            .reverse()
            .map(({ m, i }) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelected(i)}
                aria-current={i === selected ? 'true' : undefined}
                className={`grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 border-t border-rule py-2 text-left text-sm ${i === selected ? 'bg-accent-tint' : 'hover:bg-sunken'}`}
              >
                <span className="pl-1">{m.label.replace(' (partial)', '*')}</span>
                <span className="flex h-2 items-center">
                  <span className="flex h-full w-1/2 justify-end">
                    <span
                      className="h-full rounded-l-sm bg-accent"
                      style={{ width: `${(m.expense / max) * 100}%` }}
                    />
                  </span>
                  <span className="h-3 w-px bg-ink" />
                  <span className="h-full w-1/2">
                    <span
                      className="block h-full rounded-r-sm bg-ink"
                      style={{ width: `${(m.income / max) * 100}%` }}
                    />
                  </span>
                </span>
                <span
                  className={`pr-1 text-right tabular-nums ${m.net < 0 ? 'text-negative' : ''}`}
                >
                  {money(m.net)}
                </span>
              </button>
            ))}
        </nav>

        {month ? (
          <article className="flex flex-col gap-10">
            <div>
              <h2 className="font-display text-3xl tracking-tight">{month.label}</h2>
              <dl className="mt-6 grid grid-cols-3 gap-6 border-y border-rule py-6">
                {[
                  ['Came in', month.income, null],
                  ['Went out', month.expense, avgExpense],
                  ['Kept', month.net, avgNet],
                ].map(([label, value, average]) => (
                  <div key={label as string}>
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="font-display text-4xl tracking-tight tabular-nums">
                      {money(value as number)}
                    </dd>
                    {average !== null && (
                      <dd className="mt-1 text-xs text-muted">
                        {(value as number) >= (average as number) ? 'Above' : 'Below'} the{' '}
                        {money(average as number)} average
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>

            <section>
              <h3 className="text-sm font-medium text-muted">Where it went</h3>
              {month.categories.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No spending by Category for this month.</p>
              ) : (
                <ol className="mt-3 flex flex-col">
                  {month.categories.slice(0, 8).map((part, i) => {
                    const share = month.expense ? part.value / month.expense : 0;
                    return (
                      <li
                        key={`${part.group}-${part.name}`}
                        className="grid grid-cols-[1.5rem_minmax(0,12rem)_1fr_6rem_3rem] items-center gap-3 border-b border-rule py-2.5 text-sm"
                      >
                        <span className="font-display text-muted italic">{i + 1}</span>
                        <span className="truncate">
                          {part.name}
                          {part.group !== part.name && (
                            <span className="text-muted"> · {part.group}</span>
                          )}
                        </span>
                        <span className="h-1.5 rounded-full bg-sunken">
                          <span
                            className={`block h-full rounded-full ${i === 0 ? 'bg-accent' : 'bg-ink'}`}
                            style={{ width: `${share * 100}%` }}
                          />
                        </span>
                        <span className="text-right tabular-nums">{money(part.value)}</span>
                        <span className="text-right text-xs text-muted tabular-nums">
                          {Math.round(share * 100)}%
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="grid gap-10 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-muted">Latest in this month</h3>
                <ul className="mt-3 text-sm">
                  {monthActivity.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between gap-3 border-b border-rule py-2"
                    >
                      <Link href={`/transactions/${item.id}`} className="truncate hover:underline">
                        {item.name}
                      </Link>
                      <span className="tabular-nums">
                        {fmt.amount(item.amountMinor, { currency: item.currency })}
                      </span>
                    </li>
                  ))}
                  {monthActivity.length === 0 && (
                    <li className="py-2 text-muted">
                      <Link href="/transactions" className="underline">
                        See the Transactions
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted">Where the money sits</h3>
                <ul className="mt-3 text-sm">
                  {figures.accounts.slice(0, 6).map((account) => (
                    <li
                      key={account.label}
                      className="flex justify-between gap-3 border-b border-rule py-2"
                    >
                      {account.href ? (
                        <Link href={account.href} className="truncate hover:underline">
                          {account.label}
                        </Link>
                      ) : (
                        <span className="truncate">{account.label}</span>
                      )}
                      <span className="tabular-nums">{money(account.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </article>
        ) : (
          <p className="text-muted">No months to show yet.</p>
        )}
      </div>
    </div>
  );
}

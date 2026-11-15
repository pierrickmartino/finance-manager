'use client';

/*
 * PROTOTYPE: throwaway. Four variants of the Dashboard's "Recent activity" card, switchable via
 * `?variant=` (A–D) on the existing /dashboards/[id] route, with the real data and the real
 * overview row around them. Pick one, then fold it into `RecentActivityCard` properly
 * (overview-row.tsx) and delete this file and the switcher.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { PrototypeSwitcher, usePrototypeVariant } from '@/components/prototype-switcher';
import { BADGE_CLASS, TILE_CLASS } from '@/components/surface';
import { RecentActivityCard, type RecentActivity } from './overview-row';

const VARIANTS = [
  { key: 'A', name: 'Current' },
  { key: 'B', name: 'Ledger by day' },
  { key: 'C', name: 'Money in / out' },
  { key: 'D', name: 'Spotlight + timeline' },
];

export function RecentActivityPrototype({ recent }: { recent: RecentActivity[] }) {
  const variant = usePrototypeVariant(VARIANTS);
  return (
    <>
      {variant === 'A' && <RecentActivityCard recent={recent} />}
      {variant === 'B' && <LedgerByDay recent={recent} />}
      {variant === 'C' && <MoneyInOut recent={recent} />}
      {variant === 'D' && <SpotlightTimeline recent={recent} />}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}

// Shared bits (header only; each variant owns its layout) --------------------------------------

function CardHeader({ aside }: { aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id="overview-recent" className="font-medium">
        Recent activity
      </h2>
      {aside ?? (
        <Link href="/transactions" className="text-sm text-muted hover:text-ink">
          View all
        </Link>
      )}
    </div>
  );
}

function Empty() {
  return <p className="mt-3 text-sm text-muted">No Transactions yet.</p>;
}

const DAY_MS = 86_400_000;

function daysAgo(isoDate: string): number {
  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Math.round((utcToday - Date.UTC(y!, m! - 1, d!)) / DAY_MS);
}

function useSigned() {
  const fmt = useFormatter();
  return (minor: number, currency: string) =>
    `${minor > 0 ? '+' : ''}${fmt.amount(minor, { currency })}`;
}

function toneOf(minor: number): string {
  return minor > 0 ? 'text-positive' : 'text-negative';
}

// B: Ledger by day ------------------------------------------------------------------------------
// A bank-statement read: rows grouped under their day, a net per day, hairline dividers, no
// avatars. Dense and scannable; the date stops repeating on every row.

function LedgerByDay({ recent }: { recent: RecentActivity[] }) {
  const fmt = useFormatter();
  const signed = useSigned();
  const days = groupBy(recent, (transaction) => transaction.bookingDate.slice(0, 10));
  const dayLabel = (iso: string) => {
    const ago = daysAgo(iso);
    if (ago === 0) return 'Today';
    if (ago === 1) return 'Yesterday';
    return fmt.date(iso);
  };
  return (
    <section aria-labelledby="overview-recent" className={`${TILE_CLASS} lg:row-span-2`}>
      <CardHeader />
      {recent.length === 0 ? (
        <Empty />
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {days.map(([day, rows]) => {
            const net = singleCurrencyNet(rows);
            return (
              <div key={day}>
                <div className="flex items-baseline justify-between border-b border-rule pb-1 text-xs text-muted">
                  <span className="font-medium text-ink-soft">{dayLabel(day)}</span>
                  {net && <span className="tabular-nums">{signed(net.minor, net.currency)}</span>}
                </div>
                <ul className="divide-y divide-rule">
                  {rows.map((transaction) => (
                    <li key={transaction.id}>
                      <Link
                        href={`/transactions/${transaction.id}`}
                        className="-mx-2 flex items-baseline gap-3 rounded-md px-2 py-2 hover:bg-sunken"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {transaction.name}
                          <span className="text-muted"> · {transaction.category}</span>
                        </span>
                        <span
                          className={`text-sm whitespace-nowrap tabular-nums ${toneOf(transaction.amountMinor)}`}
                        >
                          {signed(transaction.amountMinor, transaction.currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// C: Money in / out -----------------------------------------------------------------------------
// Leads with the answer to "what just happened to my money": in vs out over these
// Transactions as two bars, then each row with a magnitude bar so the big ones jump out.

function MoneyInOut({ recent }: { recent: RecentActivity[] }) {
  const fmt = useFormatter();
  const currencies = groupBy(recent, (transaction) => transaction.currency);
  const largest = Math.max(1, ...recent.map((transaction) => Math.abs(transaction.amountMinor)));
  return (
    <section aria-labelledby="overview-recent" className={`${TILE_CLASS} lg:row-span-2`}>
      <CardHeader />
      {recent.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3">
            {currencies.map(([currency, rows]) => {
              const moneyIn = rows
                .filter((r) => r.amountMinor > 0)
                .reduce((t, r) => t + r.amountMinor, 0);
              const moneyOut = rows
                .filter((r) => r.amountMinor < 0)
                .reduce((t, r) => t - r.amountMinor, 0);
              const scale = Math.max(1, moneyIn, moneyOut);
              return (
                <div
                  key={currency}
                  className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm"
                >
                  <span className="text-muted">In</span>
                  <span className="h-2 rounded-full bg-sunken">
                    <span
                      className="block h-2 rounded-full bg-hero-glow"
                      style={{ width: `${(moneyIn / scale) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-medium text-positive tabular-nums">
                    {fmt.amount(moneyIn, { currency })}
                  </span>
                  <span className="text-muted">Out</span>
                  <span className="h-2 rounded-full bg-sunken">
                    <span
                      className="block h-2 rounded-full bg-hero-deep"
                      style={{ width: `${(moneyOut / scale) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-medium text-negative tabular-nums">
                    {fmt.amount(moneyOut, { currency })}
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-muted">Across the last {recent.length} Transactions</p>
          </div>
          <ul className="mt-4 flex flex-col gap-1 border-t border-rule pt-3">
            {recent.map((transaction) => (
              <li key={transaction.id}>
                <Link
                  href={`/transactions/${transaction.id}`}
                  className="relative block overflow-hidden rounded-md px-2 py-1.5 hover:bg-sunken"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-hero-mist/35"
                    style={{ width: `${(Math.abs(transaction.amountMinor) / largest) * 100}%` }}
                  />
                  <span className="relative flex items-baseline gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{transaction.name}</span>
                    <span
                      className={`whitespace-nowrap tabular-nums ${toneOf(transaction.amountMinor)}`}
                    >
                      {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// D: Spotlight + timeline -----------------------------------------------------------------------
// One Transaction is the story (the largest of the lot, shown big), the rest a vertical
// timeline with relative times and Category badges. Hierarchy over uniformity.

function SpotlightTimeline({ recent }: { recent: RecentActivity[] }) {
  const fmt = useFormatter();
  const signed = useSigned();
  const spotlight = recent.reduce<RecentActivity | undefined>(
    (best, transaction) =>
      !best || Math.abs(transaction.amountMinor) > Math.abs(best.amountMinor) ? transaction : best,
    undefined,
  );
  const rest = recent.filter((transaction) => transaction.id !== spotlight?.id);
  const relative = (iso: string) => {
    const ago = daysAgo(iso);
    if (ago <= 0) return 'Today';
    if (ago === 1) return 'Yesterday';
    if (ago < 7) return `${ago} days ago`;
    return fmt.date(iso);
  };
  return (
    <section aria-labelledby="overview-recent" className={`${TILE_CLASS} lg:row-span-2`}>
      <CardHeader />
      {!spotlight ? (
        <Empty />
      ) : (
        <>
          <Link
            href={`/transactions/${spotlight.id}`}
            className="mt-3 block rounded-2xl bg-hero-deep p-4 text-on-hero hover:bg-hero"
          >
            <span className="text-xs text-on-hero/70">
              Largest lately · {relative(spotlight.bookingDate)}
            </span>
            <span className="mt-1 block font-display text-3xl tracking-tight tabular-nums">
              {signed(spotlight.amountMinor, spotlight.currency)}
            </span>
            <span className="mt-1 block truncate text-sm text-on-hero/85">
              {spotlight.name} · {spotlight.category}
            </span>
          </Link>
          <ol className="mt-4 ml-1.5 border-l border-rule">
            {rest.map((transaction) => (
              <li key={transaction.id} className="relative pb-3 pl-4 last:pb-0">
                <span
                  aria-hidden
                  className="absolute top-2 -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-hero-mid"
                />
                <Link
                  href={`/transactions/${transaction.id}`}
                  className="-mx-2 block rounded-md px-2 py-1 hover:bg-sunken"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {transaction.name}
                    </span>
                    <span
                      className={`text-sm whitespace-nowrap tabular-nums ${toneOf(transaction.amountMinor)}`}
                    >
                      {signed(transaction.amountMinor, transaction.currency)}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className={BADGE_CLASS.neutral}>{transaction.category}</span>
                    {relative(transaction.bookingDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

// Helpers --------------------------------------------------------------------------------------

function groupBy<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return [...groups.entries()];
}

function singleCurrencyNet(rows: RecentActivity[]): { minor: number; currency: string } | null {
  const currency = rows[0]?.currency;
  if (!currency || rows.some((row) => row.currency !== currency)) return null;
  return { minor: rows.reduce((total, row) => total + row.amountMinor, 0), currency };
}

'use client';

/**
 * PROTOTYPE — Variant C "Coverage": organised by outcome, not by run order. A health strip
 * up top, status tabs (`?show=`), and the Rules grouped by the Category (or Payee, `?group=`)
 * they set, so "which Rules feed Groceries?" and "which Rules never match?" are one glance.
 * Run order is a badge; reordering lives on the Rule's own page in this variant.
 */
import Link from 'next/link';
import { CARD_CLASS, GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import {
  ActionChips,
  EnabledSwitch,
  NewRuleLink,
  type ProtoRule,
  type VariantProps,
} from './shared';

export const name = 'Coverage';

const SHOWS = {
  all: { label: 'All', keep: () => true },
  enabled: { label: 'Enabled', keep: (row: ProtoRule) => row.enabled },
  disabled: { label: 'Disabled', keep: (row: ProtoRule) => !row.enabled },
  idle: { label: 'No matches', keep: (row: ProtoRule) => row.matchCount === 0 },
} as const;
type Show = keyof typeof SHOWS;
type Group = 'category' | 'payee';

function href(params: Record<string, string | undefined>, patch: Record<string, string>) {
  const query = new URLSearchParams(
    Object.entries({ ...params, ...patch }).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  );
  return `/rules?${query.toString()}`;
}

export function VariantC({ rows, params }: VariantProps) {
  const show: Show = params.show && params.show in SHOWS ? (params.show as Show) : 'all';
  const group: Group = params.group === 'payee' ? 'payee' : 'category';
  const rank = new Map(rows.map((row, index) => [row.id, index + 1]));
  const visible = rows.filter(SHOWS[show].keep);

  const groups = new Map<string, ProtoRule[]>();
  for (const row of visible) {
    const key = (group === 'category' ? row.category : row.payee) ?? '';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  );
  const counts = {
    all: rows.length,
    enabled: rows.filter(SHOWS.enabled.keep).length,
    disabled: rows.filter(SHOWS.disabled.keep).length,
    idle: rows.filter(SHOWS.idle.keep).length,
  };
  const matched = rows.reduce((sum, row) => sum + row.matchCount, 0);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Rules</h1>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <Link href="/rules/apply" className={GHOST_BUTTON_CLASS}>
              Apply all Rules
            </Link>
          )}
          <NewRuleLink className={PRIMARY_BUTTON_CLASS} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Rules" value={counts.all} />
        <Tile label="Running" value={counts.enabled} hint={`${counts.disabled} disabled`} />
        <Tile label="Transactions matched" value={matched} hint="summed over Rules" />
        <Tile
          label="Never match"
          value={counts.idle}
          hint={counts.idle > 0 ? 'worth a look' : 'all Rules match something'}
          warn={counts.idle > 0}
        />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Show" className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(Object.keys(SHOWS) as Show[]).map((key) => (
            <Link
              key={key}
              href={href(params, { show: key })}
              scroll={false}
              aria-current={key === show ? 'page' : undefined}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                key === show
                  ? 'bg-white shadow-sm dark:bg-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
              }`}
            >
              {SHOWS[key].label} <span className="tabular-nums text-zinc-400">{counts[key]}</span>
            </Link>
          ))}
        </nav>
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          Group by
          {(['category', 'payee'] as const).map((key) => (
            <Link
              key={key}
              href={href(params, { group: key })}
              scroll={false}
              aria-current={key === group ? 'true' : undefined}
              className={
                key === group ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'hover:underline'
              }
            >
              {key === 'category' ? 'Category' : 'Payee'}
            </Link>
          ))}
        </p>
      </div>

      {sorted.length === 0 && <p className="text-sm text-zinc-500">No Rules here.</p>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {sorted.map(([key, members]) => (
          <section
            key={key || 'none'}
            aria-label={key || 'No ' + group}
            className={`${CARD_CLASS} overflow-hidden`}
          >
            <h2 className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
              <span className={`font-semibold ${key ? '' : 'italic text-zinc-500'}`}>
                {key || (group === 'category' ? 'Sets no Category' : 'Sets no Payee')}
              </span>
              <span className="text-xs text-zinc-500">
                {members.length} Rule{members.length === 1 ? '' : 's'}
                {members.filter((row) => row.enabled).length > 1 && ' · first match wins'}
              </span>
            </h2>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {members.map((row) => (
                <li
                  key={row.id}
                  data-rule-id={row.id}
                  className={`flex items-start gap-3 px-4 py-2.5 text-sm ${row.enabled ? '' : 'text-zinc-500'}`}
                >
                  <span
                    title="Run order"
                    className="mt-0.5 rounded bg-zinc-100 px-1.5 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    #{rank.get(row.id)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/rules/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {row.conditions.join(' · ') || 'every Transaction'}
                    </span>
                    <ActionChips row={row} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <EnabledSwitch row={row} />
                    <Link
                      href={`/rules/apply?ruleId=${row.id}`}
                      className={`text-xs tabular-nums ${row.matchCount === 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-zinc-500 hover:underline'}`}
                      title="Apply to existing Transactions"
                    >
                      {row.matchCount} match{row.matchCount === 1 ? '' : 'es'}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

interface TileProps {
  label: string;
  value: number;
  hint?: string;
  warn?: boolean;
}

function Tile({ label, value, hint, warn }: TileProps) {
  return (
    <div className={`${CARD_CLASS} p-4 ${warn ? 'border-amber-300 dark:border-amber-700' : ''}`}>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd
        className={`text-2xl font-semibold tabular-nums ${warn ? 'text-amber-700 dark:text-amber-400' : ''}`}
      >
        {value}
      </dd>
      {hint && <dd className="text-xs text-zinc-500">{hint}</dd>}
    </div>
  );
}

'use client';

/**
 * PROTOTYPE — Variant B "Inspector": master / detail like Payees and Transactions. A compact
 * run-order list on the left (filtered by `?q=`), the selected Rule (`?rule=`, else the first)
 * spelled out on the right with every action and its History.
 */
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/components/surface';
import {
  ActionChips,
  ConditionChip,
  DeleteButton,
  EnabledSwitch,
  NewRuleLink,
  useRuleOrder,
  type ProtoRule,
  type VariantProps,
} from './shared';

export const name = 'Inspector';

function href(params: Record<string, string | undefined>, patch: Record<string, string>) {
  const query = new URLSearchParams(
    Object.entries({ ...params, ...patch }).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  );
  return `/rules?${query.toString()}`;
}

const historyHref = (filter: Record<string, string>) =>
  `/history?${new URLSearchParams(filter).toString()}`;

export function VariantB({ rows, reorder, params }: VariantProps) {
  const { ordered, dragged, error, isPending, moveBy, dragProps, handleProps } = useRuleOrder(
    rows,
    reorder,
  );
  const query = (params.q ?? '').trim().toLowerCase();
  const visible = query
    ? ordered.filter((row) =>
        [row.name, ...row.conditions, row.actions].join(' ').toLowerCase().includes(query),
      )
    : ordered;
  const selected = visible.find((row) => row.id === params.rule) ?? visible[0];
  const position = selected ? ordered.indexOf(selected) : -1;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="text-sm text-zinc-500">
            {rows.length} Rule{rows.length === 1 ? '' : 's'} ·{' '}
            {rows.reduce((sum, row) => sum + row.matchCount, 0)} matches · run top to bottom
          </p>
        </div>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <Link href="/rules/apply" className={GHOST_BUTTON_CLASS}>
              Apply all Rules
            </Link>
          )}
          <NewRuleLink className={PRIMARY_BUTTON_CLASS} />
        </div>
      </header>

      <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className={`${CARD_CLASS} flex flex-col overflow-hidden`}>
          <form action="/rules" className="border-b border-zinc-200 p-2 dark:border-zinc-800">
            <input type="hidden" name="variant" value="B" />
            <input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Find a Rule, condition or Category…"
              aria-label="Find a Rule"
              className={`${INPUT_CLASS} w-full`}
            />
          </form>
          {error && (
            <div className="p-2">
              <FieldError message={error} />
            </div>
          )}
          <ol
            aria-label="Rules"
            aria-busy={isPending}
            className="divide-y divide-zinc-100 dark:divide-zinc-800"
          >
            {visible.map((row) => (
              <li
                key={row.id}
                data-rule-id={row.id}
                {...dragProps(row.id)}
                className={dragged === row.id ? 'opacity-50' : ''}
              >
                <Link
                  href={href(params, { rule: row.id })}
                  scroll={false}
                  aria-current={row.id === selected?.id ? 'true' : undefined}
                  className={`flex items-center gap-2 px-3 py-2 text-sm ${
                    row.id === selected?.id
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <span
                    {...handleProps(row.id)}
                    aria-label={`Drag ${row.name}`}
                    role="img"
                    className="cursor-grab select-none text-zinc-400"
                  >
                    ⠿
                  </span>
                  <span className="w-5 text-right text-xs tabular-nums text-zinc-400">
                    {ordered.indexOf(row) + 1}
                  </span>
                  <span
                    aria-label={row.enabled ? 'Enabled' : 'Disabled'}
                    className={`h-2 w-2 shrink-0 rounded-full ${row.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  />
                  <span
                    className={`min-w-0 flex-1 ${row.enabled ? 'font-medium' : 'text-zinc-500'}`}
                  >
                    {row.name}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-500">{row.matchCount}</span>
                </Link>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="p-3 text-sm text-zinc-500">
                {rows.length === 0 ? 'No Rules yet.' : 'No Rule matches.'}
              </li>
            )}
          </ol>
        </aside>

        {selected ? (
          <Detail
            row={selected}
            position={position}
            total={ordered.length}
            isPending={isPending}
            moveBy={moveBy}
          />
        ) : (
          <p className="text-sm text-zinc-500">Pick a Rule.</p>
        )}
      </div>
    </section>
  );
}

interface DetailProps {
  row: ProtoRule;
  position: number;
  total: number;
  isPending: boolean;
  moveBy: (id: string, delta: -1 | 1) => void;
}

function Detail({ row, position, total, isPending, moveBy }: DetailProps) {
  return (
    <article aria-label={row.name} className={`${CARD_CLASS} flex flex-col gap-5 p-5`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Rule {position + 1} of {total}
          </p>
          <h2 className="text-xl font-semibold">{row.name}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {row.enabled ? 'Enabled' : 'Disabled'}
          <EnabledSwitch row={row} />
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Matches now" value={String(row.matchCount)} />
        <Stat label="Conditions" value={String(row.conditions.length)} />
        <Stat
          label="Sets"
          value={String([row.payee, row.category].filter(Boolean).length + row.tags.length)}
        />
      </dl>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">When a Transaction matches all of</h3>
        <ul className="flex flex-col gap-1.5">
          {row.conditions.map((condition, i) => (
            <li key={i}>
              <ConditionChip>{condition}</ConditionChip>
            </li>
          ))}
          {row.conditions.length === 0 && <li className="text-sm text-zinc-500">No conditions</li>}
        </ul>
        <h3 className="text-sm font-semibold">Then set</h3>
        <ActionChips row={row} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Link href={`/rules/${row.id}`} className={PRIMARY_BUTTON_CLASS}>
          Edit Rule
        </Link>
        <Link href={`/rules/apply?ruleId=${row.id}`} className={GHOST_BUTTON_CLASS}>
          Apply to existing…
        </Link>
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          aria-label={`Move ${row.name} up`}
          disabled={position === 0 || isPending}
          onClick={() => moveBy(row.id, -1)}
        >
          Run earlier ↑
        </button>
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          aria-label={`Move ${row.name} down`}
          disabled={position === total - 1 || isPending}
          onClick={() => moveBy(row.id, 1)}
        >
          Run later ↓
        </button>
        <span className="flex-1" />
        <DeleteButton row={row} className={DANGER_BUTTON_CLASS} />
      </div>

      <p className="text-xs text-zinc-500">
        Editing changes future imports and Manual transactions only.{' '}
        <Link href={historyHref({ entityType: 'rule', entityId: row.id })} className="underline">
          Rule History
        </Link>
        {' · '}
        <Link href={historyHref({ actorType: 'rule', actorId: row.id })} className="underline">
          Changes made by this Rule
        </Link>
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

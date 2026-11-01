'use client';

/**
 * PROTOTYPE — Variant A "Pipeline": the Rules as numbered steps a Transaction flows through,
 * each read as an IF … THEN … sentence with chips. Run order is the main idea on the page.
 */
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import {
  ActionChips,
  ConditionChip,
  DeleteButton,
  EnabledSwitch,
  NewRuleLink,
  useRuleOrder,
  type VariantProps,
} from './shared';

export const name = 'Pipeline';

export function VariantA({ rows, reorder }: VariantProps) {
  const { ordered, order, dragged, error, isPending, moveBy, dragProps, handleProps } =
    useRuleOrder(rows, reorder);
  const enabled = rows.filter((row) => row.enabled).length;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="text-sm text-zinc-500">
            {enabled} of {rows.length} running, top to bottom
          </p>
        </div>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <Link href="/rules/apply" className={GHOST_BUTTON_CLASS}>
              Apply all to existing…
            </Link>
          )}
          <NewRuleLink className={PRIMARY_BUTTON_CLASS} />
        </div>
      </header>

      {error && <FieldError message={error} />}

      <ol aria-label="Rules" aria-busy={isPending} className="relative flex flex-col">
        <li className="flex items-center gap-3 pb-4 text-sm text-zinc-500">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-zinc-300 dark:border-zinc-700">
            ↓
          </span>
          A Transaction comes in (import preview or Manual save)
        </li>
        {ordered.map((row, index) => (
          <li
            key={row.id}
            data-rule-id={row.id}
            {...dragProps(row.id)}
            className={`group relative flex gap-3 pb-4 ${dragged === row.id ? 'opacity-50' : ''}`}
          >
            <span
              aria-hidden
              className="absolute left-4 top-8 -bottom-0 w-px bg-zinc-200 dark:bg-zinc-800"
            />
            <span
              {...handleProps(row.id)}
              aria-label={`Drag ${row.name}`}
              role="img"
              title="Drag to reorder"
              className={`relative z-10 grid h-8 w-8 shrink-0 cursor-grab place-items-center rounded-full text-sm font-semibold tabular-nums ${
                row.enabled
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'border border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950'
              }`}
            >
              {index + 1}
            </span>
            <div
              className={`flex min-w-0 flex-1 flex-col gap-2 rounded-xl border p-3 ${
                row.enabled
                  ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                  : 'border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/rules/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-zinc-500">
                    {row.matchCount} match{row.matchCount === 1 ? '' : 'es'}
                  </span>
                  <EnabledSwitch row={row} />
                </div>
              </div>
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  If
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {row.conditions.length === 0 ? (
                    <span className="text-xs text-zinc-400">every Transaction</span>
                  ) : (
                    row.conditions.map((condition, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-xs text-zinc-400">and</span>}
                        <ConditionChip>{condition}</ConditionChip>
                      </span>
                    ))
                  )}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Then
                </span>
                <ActionChips row={row} />
              </div>
              <div className="flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-2 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-zinc-800">
                <button
                  type="button"
                  className={GHOST_BUTTON_CLASS}
                  aria-label={`Move ${row.name} up`}
                  disabled={index === 0 || isPending}
                  onClick={() => moveBy(row.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={GHOST_BUTTON_CLASS}
                  aria-label={`Move ${row.name} down`}
                  disabled={index === order.length - 1 || isPending}
                  onClick={() => moveBy(row.id, 1)}
                >
                  ↓
                </button>
                <Link href={`/rules/${row.id}`} className={GHOST_BUTTON_CLASS}>
                  Edit
                </Link>
                <Link href={`/rules/apply?ruleId=${row.id}`} className={GHOST_BUTTON_CLASS}>
                  Apply…
                </Link>
                <span className="flex-1" />
                <DeleteButton row={row} className={GHOST_BUTTON_CLASS} />
              </div>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-zinc-300 dark:border-zinc-700">
            ✓
          </span>
          Fields no Rule set stay empty; fields you edited by hand are never changed
        </li>
      </ol>
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">No Rules yet: the pipeline is empty.</p>
      )}
    </section>
  );
}

/* PROTOTYPE — Variant C: a "tidy up" page. Suggested merges first, then usage tiers. */
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import type { Payee } from '@/server/services/payees';
import { Menu } from '../../categories/menu';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '../../categories/styles';
import { duplicateClusters, plural } from './shared';
import { prototypeStubAction } from './stub-action';

export const VARIANT_C_NAME = 'Tidy-up';

const RARE_MAX = 2;

export function VariantC({ payees }: { payees: Payee[] }) {
  const clusters = duplicateClusters(payees);
  const busy = payees
    .filter((payee) => payee.transactionCount > RARE_MAX)
    .sort((a, b) => b.transactionCount - a.transactionCount);
  const rare = payees.filter(
    (payee) => payee.transactionCount > 0 && payee.transactionCount <= RARE_MAX,
  );
  const unused = payees.filter((payee) => payee.transactionCount === 0);
  const max = busy[0]?.transactionCount ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payees</h1>
          <p className="text-sm text-zinc-500">{plural(payees.length, 'Payee')}</p>
        </div>
        <ActionForm action={prototypeStubAction} label="New Payee" className="flex gap-2">
          <input
            name="name"
            aria-label="New Payee name"
            placeholder="New Payee…"
            required
            maxLength={100}
            className={INPUT_CLASS}
          />
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Add
          </button>
        </ActionForm>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Possible duplicates" value={clusters.length} tone="text-amber-600" />
        <Stat label={`Rarely used (≤${RARE_MAX})`} value={rare.length} tone="text-zinc-600" />
        <Stat label="Unused" value={unused.length} tone="text-rose-600" />
      </div>

      {clusters.length > 0 && (
        <section aria-label="Possible duplicates" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Possible duplicates</h2>
          <p className="text-sm text-zinc-500">
            Payees with a similar name. Merge them into the busiest one, or dismiss.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {clusters.map((cluster) => (
              <DuplicateCard key={cluster[0]!.id} cluster={cluster} />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Payees by use" className={`${CARD_CLASS} flex flex-col`}>
        <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold dark:border-zinc-800">
          Most used
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {busy.map((payee) => (
            <UsageRow key={payee.id} payee={payee} payees={payees} max={max} />
          ))}
        </ul>
        {rare.length > 0 && (
          <details className="border-t border-zinc-100 dark:border-zinc-800">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
              Rarely used · {rare.length}
            </summary>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rare.map((payee) => (
                <UsageRow key={payee.id} payee={payee} payees={payees} max={max} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {unused.length > 0 && (
        <section aria-label="Unused Payees" className={`${CARD_CLASS} flex flex-col gap-3 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Unused · safe to delete</h2>
            <ActionForm
              action={prototypeStubAction}
              label="Delete all unused"
              confirmMessage={`Delete ${plural(unused.length, 'unused Payee')}?`}
            >
              <button type="submit" className={DANGER_BUTTON_CLASS}>
                Delete all {unused.length}
              </button>
            </ActionForm>
          </div>
          <ul className="flex flex-wrap gap-2">
            {unused.map((payee) => (
              <li
                key={payee.id}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-3 text-sm dark:bg-zinc-800"
              >
                {payee.name}
                <ActionForm action={prototypeStubAction} label={`Delete ${payee.name}`}>
                  <button
                    type="submit"
                    aria-label={`Delete ${payee.name}`}
                    className="grid h-5 w-5 place-items-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-rose-600 dark:hover:bg-zinc-700"
                  >
                    ×
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`${CARD_CLASS} p-3`}>
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function DuplicateCard({ cluster }: { cluster: Payee[] }) {
  const [target, ...others] = cluster;
  const moving = others.reduce((sum, payee) => sum + payee.transactionCount, 0);
  return (
    <div className={`${CARD_CLASS} flex flex-col gap-3 border-amber-200 p-4 dark:border-amber-900`}>
      <ul className="flex flex-col gap-1 text-sm">
        {cluster.map((payee, index) => (
          <li key={payee.id} className="flex justify-between gap-2">
            <span className={index === 0 ? 'font-semibold' : 'text-zinc-500 line-through'}>
              {payee.name}
            </span>
            <span className="text-zinc-400 tabular-nums">{payee.transactionCount}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <ActionForm
          action={prototypeStubAction}
          label={`Merge into ${target!.name}`}
          confirmMessage={`Merge ${plural(others.length, 'Payee')} (${moving} Transactions) into "${target!.name}"?`}
        >
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Merge into {target!.name}
          </button>
        </ActionForm>
        <button type="button" className={GHOST_BUTTON_CLASS}>
          Not duplicates
        </button>
      </div>
    </div>
  );
}

function UsageRow({ payee, payees, max }: { payee: Payee; payees: Payee[]; max: number }) {
  const width = max > 0 ? (payee.transactionCount / max) * 100 : 0;
  return (
    <li className="group flex items-center gap-4 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{payee.name}</span>
      <div
        aria-hidden="true"
        className="hidden h-1.5 w-48 rounded-full bg-zinc-100 sm:block dark:bg-zinc-800"
      >
        <div className="h-1.5 rounded-full bg-zinc-500/60" style={{ width: `${width}%` }} />
      </div>
      <Link
        href={`/transactions?payeeId=${payee.id}`}
        className="w-12 text-right text-sm text-zinc-500 tabular-nums hover:underline"
      >
        {payee.transactionCount}
      </Link>
      <Menu
        trigger="⋯"
        label={`Actions for ${payee.name}`}
        triggerClassName={`${GHOST_BUTTON_CLASS} sm:opacity-60 sm:group-hover:opacity-100`}
      >
        <ActionForm action={prototypeStubAction} label={`Rename ${payee.name}`}>
          <input
            name="name"
            aria-label={`Name of ${payee.name}`}
            defaultValue={payee.name}
            required
            maxLength={100}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <button type="submit" className={GHOST_BUTTON_CLASS}>
            Rename
          </button>
        </ActionForm>
        <ActionForm action={prototypeStubAction} label={`Merge ${payee.name}`}>
          <select
            name="targetId"
            aria-label={`Merge ${payee.name} into`}
            required
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          >
            <option value="">Merge into…</option>
            {payees
              .filter((other) => other.id !== payee.id)
              .map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
          </select>
          <button type="submit" className={GHOST_BUTTON_CLASS}>
            Merge
          </button>
        </ActionForm>
      </Menu>
    </li>
  );
}

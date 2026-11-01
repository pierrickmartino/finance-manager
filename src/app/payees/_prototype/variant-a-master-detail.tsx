/* PROTOTYPE — Variant A: master / detail, the same shape the Categories page landed on. */
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
import { byInitial, plural, type RecentTransaction } from './shared';
import { prototypeStubAction } from './stub-action';

export const VARIANT_A_NAME = 'Master / detail';

interface VariantAProps {
  payees: Payee[];
  selected: Payee | undefined;
  recent: RecentTransaction[];
  query: string;
}

export function VariantA({ payees, selected, recent, query }: VariantAProps) {
  const visible = query
    ? payees.filter((payee) => payee.name.toLowerCase().includes(query.toLowerCase()))
    : payees;
  const total = payees.reduce((sum, payee) => sum + payee.transactionCount, 0);
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Payees</h1>
        <p className="text-sm text-zinc-500">
          {plural(payees.length, 'Payee')} · {plural(total, 'Transaction')}
        </p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[16rem_1fr] lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Payees" className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
          {/* A GET form keeps the filter in the URL, like ?group= on Categories. */}
          <form className="flex">
            <input type="hidden" name="variant" value="A" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Filter Payees…"
              aria-label="Filter Payees"
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
          </form>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {byInitial(visible).map(({ initial, payees: ofInitial }) => (
              <div key={initial} className="flex flex-col gap-0.5">
                <h2 className="px-2 text-xs font-semibold tracking-wide text-zinc-400">
                  {initial}
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {ofInitial.map((payee) => (
                    <li key={payee.id}>
                      <PayeeLink payee={payee} isActive={payee.id === selected?.id} query={query} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="px-2 text-sm text-zinc-400">No Payee matches “{query}”.</p>
            )}
          </div>
          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <Menu trigger="+ New Payee" triggerClassName={`${GHOST_BUTTON_CLASS} inline-block`}>
              <ActionForm action={prototypeStubAction} label="New Payee" className="flex gap-2">
                <input
                  name="name"
                  aria-label="Payee name"
                  required
                  maxLength={100}
                  className={`${INPUT_CLASS} min-w-0 flex-1`}
                />
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  Add
                </button>
              </ActionForm>
            </Menu>
          </div>
        </nav>
        {selected ? (
          <PayeeDetail payee={selected} payees={payees} recent={recent} />
        ) : (
          <p className="text-sm text-zinc-500">No Payees yet.</p>
        )}
      </div>
    </section>
  );
}

function PayeeLink({ payee, isActive, query }: { payee: Payee; isActive: boolean; query: string }) {
  const href = `/payees?variant=A&payee=${payee.id}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isActive
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <span className="truncate">{payee.name}</span>
      <span className={`text-xs tabular-nums ${isActive ? 'opacity-70' : 'text-zinc-400'}`}>
        {payee.transactionCount}
      </span>
    </Link>
  );
}

function PayeeDetail({
  payee,
  payees,
  recent,
}: {
  payee: Payee;
  payees: Payee[];
  recent: RecentTransaction[];
}) {
  const isUnused = payee.transactionCount === 0;
  return (
    <section aria-label={`Payee ${payee.name}`} className={`${CARD_CLASS} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{payee.name}</h2>
          <Link
            href={`/transactions?payeeId=${payee.id}`}
            className="text-sm text-zinc-400 hover:underline"
          >
            {plural(payee.transactionCount, 'Transaction')}
          </Link>
          {isUnused && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950 dark:text-amber-300">
              Unused
            </span>
          )}
        </div>
        <Menu trigger="Edit Payee" triggerClassName={GHOST_BUTTON_CLASS}>
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
          {payees.length > 1 && (
            <ActionForm
              action={prototypeStubAction}
              label={`Merge ${payee.name}`}
              confirmMessage={`Move every Transaction of "${payee.name}" to the chosen Payee and delete "${payee.name}"?`}
            >
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
          )}
          {isUnused && (
            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <ActionForm
                action={prototypeStubAction}
                label={`Delete ${payee.name}`}
                confirmMessage={`Delete "${payee.name}"?`}
              >
                <button type="submit" className={DANGER_BUTTON_CLASS}>
                  Delete Payee
                </button>
              </ActionForm>
            </div>
          )}
        </Menu>
      </div>

      <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
        Recent Transactions
      </h3>
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-400">
          No Transactions. An unused Payee can be deleted from Edit Payee.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {recent.map((transaction) => (
            <li key={transaction.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-zinc-500 tabular-nums">{transaction.date}</span>
              <Link
                href={`/transactions/${transaction.id}`}
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {transaction.description}
                <span className="block truncate text-xs text-zinc-400">
                  {transaction.account} · {transaction.category}
                </span>
              </Link>
              <span
                className={`shrink-0 tabular-nums ${transaction.isOutflow ? '' : 'text-emerald-600'}`}
              >
                {transaction.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
      {payee.transactionCount > recent.length && (
        <Link
          href={`/transactions?payeeId=${payee.id}`}
          className="border-t border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          All {plural(payee.transactionCount, 'Transaction')} →
        </Link>
      )}
    </section>
  );
}

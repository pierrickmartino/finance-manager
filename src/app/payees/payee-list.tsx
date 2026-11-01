import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Menu } from '@/components/menu';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { Payee } from '@/server/services/payees';
import { createPayeeAction } from './actions';
import { payeeHref, payeesByInitial } from './view';

interface PayeeListProps {
  /** The Payees the filter shows. */
  payees: Payee[];
  selectedId: string | undefined;
  query: string;
}

/** The master list: a filter, the Payees A-Z with their Transaction counts, and adding one. */
export function PayeeList({ payees, selectedId, query }: PayeeListProps) {
  return (
    <nav aria-label="Payees" className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
      {/* A GET form: the filter lives in the URL (?q=), like the selected Payee (?payee=). */}
      <form role="search" action="/payees" className="flex items-center gap-1">
        {selectedId && <input type="hidden" name="payee" value={selectedId} />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Filter Payees…"
          aria-label="Filter Payees"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        {query && (
          <Link
            href={selectedId ? payeeHref(selectedId, '') : '/payees'}
            className={GHOST_BUTTON_CLASS}
          >
            Clear
          </Link>
        )}
      </form>

      <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto">
        {payeesByInitial(payees).map(({ initial, payees: ofInitial }) => (
          <div key={initial} className="flex flex-col gap-0.5">
            <h2 className="px-2 text-xs font-semibold tracking-wide text-zinc-400">{initial}</h2>
            <ul className="flex flex-col gap-0.5">
              {ofInitial.map((payee) => (
                <li key={payee.id}>
                  <PayeeLink payee={payee} isActive={payee.id === selectedId} query={query} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {payees.length === 0 && (
          <p className="px-2 text-sm text-zinc-400">
            {query ? `No Payee matches "${query}".` : 'No Payees yet.'}
          </p>
        )}
      </div>

      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Menu trigger="+ New Payee" triggerClassName={`${GHOST_BUTTON_CLASS} inline-block`}>
          <ActionForm action={createPayeeAction} label="New Payee" className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Payee name
              <input name="name" required maxLength={100} className={INPUT_CLASS} />
            </label>
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              Add Payee
            </button>
          </ActionForm>
        </Menu>
      </div>
    </nav>
  );
}

function PayeeLink({ payee, isActive, query }: { payee: Payee; isActive: boolean; query: string }) {
  return (
    <Link
      href={payeeHref(payee.id, query)}
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

import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listPayees } from '@/server/services/payees';
import { listTransactions } from '@/server/services/transactions';
import { PayeeDetail } from './payee-detail';
import { PayeeList } from './payee-list';
import { filterPayees, selectPayee } from './view';

export const metadata: Metadata = { title: 'Payees · Finance Manager' };

/** How many of the selected Payee's Transactions the detail pane lists. */
const RECENT_COUNT = 10;

interface PayeesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The managed list of Payees (spec 45-47), as master / detail: the Payees A-Z on the left
 * (filtered by `?q=`), the selected one (`?payee=`, else the first shown) and its latest
 * Transactions on the right.
 */
export default async function PayeesPage({ searchParams }: PayeesPageProps) {
  const ctx = await getServiceContext();
  const [payees, fmt, params] = await Promise.all([listPayees(ctx), getFormatter(), searchParams]);
  const query = typeof params.q === 'string' ? params.q : '';
  const visible = filterPayees(payees, query);
  const selected = selectPayee(
    payees,
    visible,
    typeof params.payee === 'string' ? params.payee : undefined,
  );
  const recent = selected
    ? (await listTransactions(ctx, { payeeId: selected.id, pageSize: RECENT_COUNT })).transactions
    : [];
  const total = payees.reduce((sum, payee) => sum + payee.transactionCount, 0);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Payees</h1>
        <p className="text-sm text-zinc-500">
          {payees.length} Payee{payees.length === 1 ? '' : 's'} · {total} Transaction
          {total === 1 ? '' : 's'}
        </p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[16rem_1fr] lg:grid-cols-[18rem_1fr]">
        <PayeeList payees={visible} selectedId={selected?.id} query={query} />
        {selected ? (
          <PayeeDetail payee={selected} payees={payees} recent={recent} fmt={fmt} />
        ) : (
          <p className="text-sm text-zinc-500">
            {payees.length === 0
              ? 'No Payees yet. Add one here, or type a new one on a Transaction.'
              : 'Pick a Payee.'}
          </p>
        )}
      </div>
    </section>
  );
}

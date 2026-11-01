import type { Metadata } from 'next';
import { NamedList } from '@/components/named-list';
import { PrototypeSwitcher } from '@/components/prototype/prototype-switcher';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listPayees } from '@/server/services/payees';
import { listTransactions } from '@/server/services/transactions';
import { VARIANT_A_NAME, VariantA } from './_prototype/variant-a-master-detail';
import { VARIANT_B_NAME, VariantB } from './_prototype/variant-b-table';
import { VARIANT_C_NAME, VariantC } from './_prototype/variant-c-tidy';
import type { RecentTransaction } from './_prototype/shared';
import {
  createPayeeAction,
  deletePayeeAction,
  mergePayeeAction,
  renamePayeeAction,
} from './actions';

export const metadata: Metadata = { title: 'Payees · Finance Manager' };

// PROTOTYPE: three redesigns of this page on the same route, switchable via `?variant=`
// (current | A | B | C) and a floating bar. Dev only. See ./_prototype/README.md.
const IS_PROTOTYPE = process.env.NODE_ENV !== 'production';
const PROTOTYPE_VARIANTS = [
  { key: 'current', name: 'Current' },
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
];
const RECENT_COUNT = 10;

interface PayeesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** PROTOTYPE: the selected Payee's latest Transactions, formatted for variant A. */
async function loadRecent(payeeId: string | undefined): Promise<RecentTransaction[]> {
  if (!payeeId) return [];
  const fmt = await getFormatter();
  const { transactions } = await listTransactions(await getServiceContext(), {
    payeeId,
    pageSize: RECENT_COUNT,
  });
  return transactions.map((transaction) => ({
    id: transaction.id,
    date: fmt.date(transaction.bookingDate),
    description: transaction.rawDescription || '(no description)',
    account: transaction.accountName,
    category: transaction.transferId ? 'Transfer' : (transaction.category?.name ?? 'Unclassified'),
    amount: fmt.amount(transaction.amountMinor, { currency: transaction.currency }),
    isOutflow: transaction.amountMinor < 0,
  }));
}

/** The managed list of Payees (spec 45-47). */
export default async function PayeesPage({ searchParams }: PayeesPageProps) {
  const payees = await listPayees(await getServiceContext());

  if (IS_PROTOTYPE) {
    const params = await searchParams;
    const variant = typeof params.variant === 'string' ? params.variant : 'current';
    if (variant !== 'current') {
      const query = typeof params.q === 'string' ? params.q : '';
      const payeeId = typeof params.payee === 'string' ? params.payee : undefined;
      const selected = payees.find((payee) => payee.id === payeeId) ?? payees[0];
      const recent = variant === 'A' ? await loadRecent(selected?.id) : [];
      return (
        <>
          {variant === 'A' && (
            <VariantA payees={payees} selected={selected} recent={recent} query={query} />
          )}
          {variant === 'B' && <VariantB payees={payees} />}
          {variant === 'C' && <VariantC payees={payees} />}
          <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} />
        </>
      );
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Payees</h1>
      <NamedList
        noun="Payee"
        items={payees}
        create={createPayeeAction}
        rename={(id) => renamePayeeAction.bind(null, id)}
        merge={(id) => mergePayeeAction.bind(null, id)}
        remove={(id) => deletePayeeAction.bind(null, id)}
        listHref={(id) => `/transactions?payeeId=${id}`}
        deleteHint="Only a Payee no Transaction uses can be deleted; merge it otherwise."
      />
      {IS_PROTOTYPE && <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} />}
    </section>
  );
}

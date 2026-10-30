import type { Metadata } from 'next';
import { NamedList } from '@/components/named-list';
import { getServiceContext } from '@/server/app-context';
import { listPayees } from '@/server/services/payees';
import {
  createPayeeAction,
  deletePayeeAction,
  mergePayeeAction,
  renamePayeeAction,
} from './actions';

export const metadata: Metadata = { title: 'Payees · Finance Manager' };

/** The managed list of Payees (spec 45-47). */
export default async function PayeesPage() {
  const payees = await listPayees(await getServiceContext());
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
    </section>
  );
}

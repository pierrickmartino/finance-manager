import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listBanks } from '@/server/services/banks';
import { CreateBankForm } from './create-bank-form';

export const metadata: Metadata = { title: 'Banks · Finance Manager' };

export default async function BanksPage() {
  const banks = await listBanks(await getServiceContext());

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Banks</h1>
      <CreateBankForm />
      {banks.length === 0 ? (
        <p className="text-sm text-zinc-500">No Banks yet.</p>
      ) : (
        <ul
          aria-label="Banks"
          className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
        >
          {banks.map((bank) => (
            <li key={bank.id} className="px-4 py-2">
              {bank.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

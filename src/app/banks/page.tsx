import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccountBalances } from '@/server/services/accounts/balances';
import { listBanks } from '@/server/services/banks';
import { BankDetail } from './bank-detail';
import { BankList } from './bank-list';
import { NewBankPanel } from './new-bank-panel';
import { NEW_BANK, selectBank, summarizeBanks } from './view';

export const metadata: Metadata = { title: 'Banks · Finance Manager' };

interface BanksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const param = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/**
 * Banks as master / detail, like the Accounts page: the Banks with their CHF totals on the
 * left, the selected one (`?bank=`, else the first; `new` for the New Bank form) on the right
 * with its Accounts. Balances are today's.
 */
export default async function BanksPage({ searchParams }: BanksPageProps) {
  const ctx = await getServiceContext();
  const params = await searchParams;
  const [banks, balances, fmt] = await Promise.all([
    listBanks(ctx),
    listAccountBalances(ctx),
    getFormatter(),
  ]);
  const summaries = summarizeBanks(banks, balances);
  const selection = selectBank(summaries, param(params.bank));
  const selected = selection.type === 'new' ? NEW_BANK : selection.summary.bank.id;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Banks</h1>
      <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <BankList summaries={summaries} selected={selected} fmt={fmt} />
        {selection.type === 'bank' ? (
          <BankDetail key={selected} summary={selection.summary} fmt={fmt} />
        ) : (
          <NewBankPanel />
        )}
      </div>
    </section>
  );
}

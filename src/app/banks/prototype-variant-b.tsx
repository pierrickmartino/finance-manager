/*
 * PROTOTYPE — throwaway. Variant B, "Master / detail": the Banks listed on the left like the
 * Accounts page, the selected Bank (`?bank=`, else the first; `new` for the form) on the right
 * with its per-Currency totals and Account table.
 */

import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { CreateBankForm } from './create-bank-form';
import { KIND_LABEL, type BankSummary } from './prototype-data';

export const VARIANT_B_NAME = 'Master / detail';

interface VariantProps {
  summaries: BankSummary[];
  selectedId: string | undefined;
  fmt: Formatter;
}

const href = (bank: string) => `/banks?variant=B&bank=${bank}`;

export function VariantB({ summaries, selectedId, fmt }: VariantProps) {
  const isNew = selectedId === 'new' || summaries.length === 0;
  const selected = isNew
    ? undefined
    : (summaries.find((row) => row.bank.id === selectedId) ?? summaries[0]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Banks</h1>
      <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <nav aria-label="Bank list" className={`${CARD_CLASS} flex flex-col p-2`}>
          {summaries.map((row) => {
            const isSelected = row.bank.id === selected?.bank.id;
            return (
              <Link
                key={row.bank.id}
                href={href(row.bank.id)}
                scroll={false}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm ${
                  isSelected
                    ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{row.bank.name}</span>
                  <span className="text-xs font-normal text-zinc-500">
                    {row.activeCount} Account{row.activeCount === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="tabular-nums">
                  {fmt.amount(row.chfMinor, { currency: 'CHF' })}
                </span>
              </Link>
            );
          })}
          <Link
            href={href('new')}
            scroll={false}
            className={`mt-3 rounded-md border border-dashed border-zinc-300 px-2 py-2 text-center text-sm dark:border-zinc-700 ${
              isNew ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
            }`}
          >
            + New Bank
          </Link>
        </nav>

        {selected ? (
          <BankDetail row={selected} fmt={fmt} />
        ) : (
          <div className={`${CARD_CLASS} flex flex-col gap-3 p-5`}>
            <h2 className="text-lg font-semibold">New Bank</h2>
            <p className="text-sm text-zinc-500">
              The institution holding one or more Accounts. Add its Accounts afterwards.
            </p>
            <CreateBankForm />
          </div>
        )}
      </div>
    </section>
  );
}

function BankDetail({ row, fmt }: { row: BankSummary; fmt: Formatter }) {
  return (
    <article className={`${CARD_CLASS} flex flex-col gap-5 p-5`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{row.bank.name}</h2>
          <p className="text-sm text-zinc-500">
            {fmt.percent(row.share)} of the household&apos;s positive balances
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {fmt.amount(row.chfMinor, { currency: 'CHF' })}
          </p>
          {row.missingRates > 0 && (
            <p className="text-xs text-amber-600">{row.missingRates} without FX rate left out</p>
          )}
        </div>
      </header>

      {row.byCurrency.length > 0 && (
        <dl className="flex flex-wrap gap-3">
          {row.byCurrency.map(({ currency, amountMinor }) => (
            <div
              key={currency}
              className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <dt className="text-xs text-zinc-500">In {currency}</dt>
              <dd className="font-medium tabular-nums">{fmt.amount(amountMinor, { currency })}</dd>
            </div>
          ))}
        </dl>
      )}

      {row.accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">No Accounts at this Bank yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="py-1 font-semibold">Account</th>
              <th className="py-1 font-semibold">Kind</th>
              <th className="py-1 font-semibold">IBAN</th>
              <th className="py-1 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {row.accounts.map(({ account, balanceMinor }) => (
              <tr key={account.id} className={account.archivedAt ? 'text-zinc-400' : ''}>
                <td className="py-2">
                  <Link href={`/accounts?account=${account.id}`} className="underline">
                    {account.name}
                  </Link>
                  {account.archivedAt && <span className="ml-1 text-xs">(archived)</span>}
                </td>
                <td className="py-2">{KIND_LABEL[account.kind] ?? account.kind}</td>
                <td className="py-2 font-mono text-xs">{account.iban ?? '—'}</td>
                <td className="py-2 text-right tabular-nums">
                  {fmt.amount(balanceMinor, { currency: account.currency })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="flex gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
        <Link href="/accounts?account=new" className="underline">
          Add an Account at {row.bank.name}
        </Link>
        <span className="text-zinc-400">Rename · Delete (not wired: prototype)</span>
      </footer>
    </article>
  );
}

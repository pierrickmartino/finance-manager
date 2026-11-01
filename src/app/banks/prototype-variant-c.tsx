/*
 * PROTOTYPE — throwaway. Variant C, "Allocation board": a single stacked bar of where the
 * money sits, then one column per Bank with its Accounts as tiles (scrolls sideways).
 * Adding a Bank is the dashed column at the end of the board.
 */

import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import { CreateBankForm } from './create-bank-form';
import { BANK_COLORS, KIND_LABEL, type BankSummary } from './prototype-data';

export const VARIANT_C_NAME = 'Allocation board';

interface VariantProps {
  summaries: BankSummary[];
  fmt: Formatter;
}

export function VariantC({ summaries, fmt }: VariantProps) {
  const total = summaries.reduce((sum, row) => sum + row.chfMinor, 0);
  const color = (index: number) => BANK_COLORS[index % BANK_COLORS.length]!;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Banks</h1>
          <p className="text-3xl font-semibold tabular-nums">
            {fmt.amount(total, { currency: 'CHF' })}
          </p>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          {summaries.map((row, index) => (
            <div
              key={row.bank.id}
              title={`${row.bank.name} · ${fmt.percent(row.share)}`}
              className={color(index)}
              style={{ width: `${row.share * 100}%` }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {summaries.map((row, index) => (
            <li key={row.bank.id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${color(index)}`} />
              {row.bank.name}
              <span className="text-zinc-500 tabular-nums">{fmt.percent(row.share)}</span>
            </li>
          ))}
        </ul>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {summaries.map((row, index) => (
          <section
            key={row.bank.id}
            aria-label={row.bank.name}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900"
          >
            <div className={`h-1 rounded-full ${color(index)}`} />
            <h2 className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">{row.bank.name}</span>
              <span className="text-sm tabular-nums">
                {fmt.amount(row.chfMinor, { currency: 'CHF' })}
              </span>
            </h2>
            {row.accounts.map(({ account, balanceMinor }) => (
              <Link
                key={account.id}
                href={`/accounts?account=${account.id}`}
                className={`flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 ${
                  account.archivedAt ? 'opacity-50' : ''
                }`}
              >
                <span className="flex justify-between gap-2 text-xs text-zinc-500">
                  <span>{KIND_LABEL[account.kind] ?? account.kind}</span>
                  <span>{account.currency}</span>
                </span>
                <span className="truncate font-medium">{account.name}</span>
                <span className="text-right text-base tabular-nums">
                  {fmt.amount(balanceMinor, { currency: account.currency })}
                </span>
              </Link>
            ))}
            <Link
              href="/accounts?account=new"
              className="rounded-lg border border-dashed border-zinc-300 p-2 text-center text-xs text-zinc-500 hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-950"
            >
              + Account
            </Link>
          </section>
        ))}
        <section className="flex w-64 shrink-0 flex-col gap-3 rounded-xl border-2 border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <h2 className="font-semibold text-zinc-500">New Bank</h2>
          <CreateBankForm />
        </section>
      </div>
    </section>
  );
}

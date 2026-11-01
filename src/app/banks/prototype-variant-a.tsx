/*
 * PROTOTYPE — throwaway. Variant A, "Ledger table": every Bank as one row of a dense table
 * (Accounts, Currencies, kinds, share, CHF total); each row expands to its Accounts.
 * The Add Bank form sits in the page header.
 */

import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { CreateBankForm } from './create-bank-form';
import { KIND_LABEL, type BankSummary } from './prototype-data';

export const VARIANT_A_NAME = 'Ledger table';

interface VariantProps {
  summaries: BankSummary[];
  fmt: Formatter;
}

export function VariantA({ summaries, fmt }: VariantProps) {
  const total = summaries.reduce((sum, row) => sum + row.chfMinor, 0);
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Banks</h1>
          <p className="text-sm text-zinc-500">
            {summaries.length} Bank{summaries.length === 1 ? '' : 's'} · Total{' '}
            <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
              {fmt.amount(total, { currency: 'CHF' })}
            </span>
          </p>
        </div>
        <CreateBankForm />
      </header>

      {summaries.length === 0 ? (
        <p className="text-sm text-zinc-500">No Banks yet.</p>
      ) : (
        <div className={`${CARD_CLASS} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs tracking-wide text-zinc-500 uppercase dark:border-zinc-800">
              <tr>
                <th className="px-4 py-2 font-semibold">Bank</th>
                <th className="px-4 py-2 text-right font-semibold">Accounts</th>
                <th className="px-4 py-2 font-semibold">Currencies</th>
                <th className="px-4 py-2 font-semibold">Kinds</th>
                <th className="w-48 px-4 py-2 font-semibold">Share</th>
                <th className="px-4 py-2 text-right font-semibold">Total (CHF)</th>
              </tr>
            </thead>
            {summaries.map((row) => (
              <BankRows key={row.bank.id} row={row} fmt={fmt} />
            ))}
          </table>
        </div>
      )}
    </section>
  );
}

function BankRows({ row, fmt }: { row: BankSummary; fmt: Formatter }) {
  return (
    <tbody className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <tr>
        <td className="px-4 py-3 font-medium">
          <details className="group">
            <summary className="cursor-pointer list-none">
              <span className="mr-1 inline-block text-zinc-400 transition group-open:rotate-90">
                ▸
              </span>
              {row.bank.name}
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-4 text-xs font-normal">
              {row.accounts.length === 0 && <li className="text-zinc-500">No Accounts yet.</li>}
              {row.accounts.map(({ account, balanceMinor }) => (
                <li key={account.id} className="flex justify-between gap-6">
                  <Link
                    href={`/accounts?account=${account.id}`}
                    className={`underline ${account.archivedAt ? 'text-zinc-400' : ''}`}
                  >
                    {account.name}
                    {account.archivedAt && ' (archived)'}
                  </Link>
                  <span className="tabular-nums">
                    {fmt.amount(balanceMinor, { currency: account.currency })}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </td>
        <td className="px-4 py-3 text-right align-top tabular-nums">{row.activeCount}</td>
        <td className="px-4 py-3 align-top">
          {row.byCurrency.map(({ currency }) => currency).join(', ') || '—'}
        </td>
        <td className="px-4 py-3 align-top text-zinc-500">
          {row.kinds.map((kind) => KIND_LABEL[kind] ?? kind).join(', ') || '—'}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-200"
                style={{ width: `${row.share * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs text-zinc-500 tabular-nums">
              {fmt.percent(row.share)}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right align-top font-medium tabular-nums">
          {fmt.amount(row.chfMinor, { currency: 'CHF' })}
          {row.missingRates > 0 && (
            <span className="block text-xs font-normal text-amber-600">
              {row.missingRates} without FX rate
            </span>
          )}
        </td>
      </tr>
    </tbody>
  );
}

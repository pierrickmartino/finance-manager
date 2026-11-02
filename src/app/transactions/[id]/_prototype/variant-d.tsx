// PROTOTYPE variant D: drawer over the list. Selecting a Transaction never leaves the list:
// it opens in a right-hand drawer with previous / next, so you can walk through Transactions
// one after another. Inside, Classify is open and the rest are collapsible sections.
// The list behind is the unfiltered first page (a real version would keep the user's filters).

import Link from 'next/link';
import type { ReactNode } from 'react';
import { SplitSection } from '../split-section';
import { TransferSection } from '../transfer-section';
import { amountClass, CategoryLabel, transactionName } from '../../transaction-display';
import {
  amountText,
  Badge,
  BankFields,
  BundledDetailsTable,
  Classify,
  DeleteButton,
  displayName,
  EditDetailsLink,
  HistoryTimeline,
  LockedFields,
  RuleLink,
  statusBadges,
  withVariant,
  type DetailProps,
} from './shared';

export const VARIANT_D_NAME = 'Drawer over the list';

const NAV =
  'grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800';

export function VariantD(props: DetailProps) {
  const { transaction, fmt, neighbours, variant } = props;
  const index = neighbours.findIndex((row) => row.id === transaction.id);
  const prev = index > 0 ? neighbours[index - 1] : undefined;
  const next = index >= 0 ? neighbours[index + 1] : undefined;
  const open = (id: string) => withVariant(`/transactions/${id}`, variant);

  return (
    <>
      {/* The list, still there behind the drawer */}
      <section className="flex flex-col gap-4 lg:pr-[38rem]">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {neighbours.map((row) => {
            const isCurrent = row.id === transaction.id;
            return (
              <li key={row.id}>
                <Link
                  href={open(row.id)}
                  scroll={false}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${
                    isCurrent
                      ? 'bg-sky-50 ring-2 ring-sky-400 ring-inset dark:bg-sky-950/40'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="w-20 shrink-0 text-xs text-zinc-500 tabular-nums">
                    {fmt.date(row.bookingDate)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{transactionName(row)}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      <CategoryLabel transaction={row} />
                    </span>
                  </span>
                  <span className={`tabular-nums ${amountClass(row.amountMinor)}`}>
                    {fmt.amount(row.amountMinor, { currency: row.currency })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* The drawer */}
      <div className="fixed inset-0 z-30 bg-zinc-950/20 lg:hidden" />
      <aside
        aria-label="Transaction"
        className="fixed inset-y-0 right-0 z-40 flex w-[38rem] max-w-full flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <Link href="/transactions" className={NAV} aria-label="Close">
            ✕
          </Link>
          <span className="flex-1 text-sm text-zinc-500">
            {index >= 0 ? `${index + 1} of ${neighbours.length}` : 'Not on this page'}
          </span>
          {prev ? (
            <Link href={open(prev.id)} scroll={false} className={NAV} aria-label="Previous">
              ↑
            </Link>
          ) : (
            <span className={`${NAV} opacity-30`}>↑</span>
          )}
          {next ? (
            <Link href={open(next.id)} scroll={false} className={NAV} aria-label="Next">
              ↓
            </Link>
          ) : (
            <span className={`${NAV} opacity-30`}>↓</span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 pb-24">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{displayName(transaction)}</h2>
              <p className="text-sm text-zinc-500">
                {fmt.date(transaction.bookingDate)} · {transaction.accountName}
              </p>
            </div>
            <p
              className={`text-2xl font-semibold whitespace-nowrap tabular-nums ${amountClass(transaction.amountMinor)}`}
            >
              {amountText(props)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statusBadges(props).map((badge) => (
              <Badge key={badge.label} {...badge} />
            ))}
          </div>
          <p className="rounded-md bg-zinc-50 p-2 font-mono text-xs break-words text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            {transaction.rawDescription || '(no description)'}
          </p>

          <Fold title="Classify" open>
            <Classify {...props} />
            <LockedFields {...props} />
            <RuleLink {...props} />
          </Fold>
          <Fold title="Bank details">
            <BankFields {...props} dense />
            <BundledDetailsTable {...props} />
          </Fold>
          <Fold title="Split & Transfer">
            <SplitSection transaction={transaction} groups={props.groups} fmt={fmt} />
            <TransferSection
              transactionId={transaction.id}
              counterpart={props.counterpart}
              options={props.linkOptions}
              fmt={fmt}
            />
          </Fold>
          <Fold title={`History (${props.history.length})`}>
            <HistoryTimeline {...props} />
          </Fold>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Link href={`/transactions/${transaction.id}`} className="text-sm underline">
              Open full page
            </Link>
            <div className="flex gap-2">
              <EditDetailsLink {...props} />
              <DeleteButton {...props} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        {title}
        <span className="text-zinc-400 transition group-open:rotate-90">›</span>
      </summary>
      <div className="flex flex-col gap-4 pt-4">{children}</div>
    </details>
  );
}

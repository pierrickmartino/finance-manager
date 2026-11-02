// PROTOTYPE variant C: header + tabs. A summary header (big amount, status badges, the
// answer to "what is this?" at a glance), then one concern at a time in tabs
// (?tab=overview|classify|split|transfer|history). Short page, no scrolling past bank fields.

import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import { categoryLabel } from '@/lib/classification';
import { SplitSection } from '../split-section';
import { TransferSection } from '../transfer-section';
import {
  amountText,
  Badge,
  BankFields,
  BundledDetailsTable,
  Classify,
  DeleteButton,
  displayName,
  EditDetailsLink,
  HistoryBlock,
  LockedFields,
  RuleLink,
  statusBadges,
  withVariant,
  type DetailProps,
} from './shared';

export const VARIANT_C_NAME = 'Header + tabs';

const TABS = [
  ['overview', 'Overview'],
  ['classify', 'Classify'],
  ['split', 'Split'],
  ['transfer', 'Transfer'],
  ['history', 'History'],
] as const;

export function VariantC(props: DetailProps) {
  const { transaction, fmt, classification, history } = props;
  const tab = TABS.some(([key]) => key === props.tab) ? props.tab : 'overview';
  const counts: Record<string, number | undefined> = {
    split: classification.splitLines.length || undefined,
    history: history.length || undefined,
  };
  const href = (key: string) =>
    withVariant(`/transactions/${transaction.id}`, props.variant, `&tab=${key}`);

  return (
    <section className="flex flex-col gap-0">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5">
        <div className="flex flex-col gap-1">
          <Link href="/transactions" className="text-sm text-zinc-500 hover:underline">
            ← Transactions
          </Link>
          <h1 className="text-2xl font-semibold">{displayName(transaction)}</h1>
          <p className="text-sm text-zinc-500">
            {fmt.date(transaction.bookingDate)} ·{' '}
            <Link href={`/accounts/${transaction.accountId}`} className="underline">
              {transaction.accountName}
            </Link>
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {statusBadges(props).map((badge) => (
              <Badge key={badge.label} {...badge} />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p
            className={`text-4xl font-semibold tabular-nums ${transaction.amountMinor > 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
          >
            {amountText(props)}
          </p>
          <div className="flex gap-2">
            <EditDetailsLink {...props} />
            <DeleteButton {...props} />
          </div>
        </div>
      </header>

      <nav
        aria-label="Transaction sections"
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
      >
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={href(key)}
            scroll={false}
            aria-current={tab === key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap ${
              tab === key
                ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {label}
            {counts[key] !== undefined && (
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 text-xs dark:bg-zinc-800">
                {counts[key]}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="pt-6">
        {tab === 'overview' && <Overview {...props} classifyHref={href('classify')} />}
        {tab === 'classify' && (
          <div className="flex max-w-xl flex-col gap-4">
            <Classify {...props} />
            <LockedFields {...props} />
            <RuleLink {...props} />
          </div>
        )}
        {tab === 'split' && (
          <SplitSection transaction={transaction} groups={props.groups} fmt={fmt} />
        )}
        {tab === 'transfer' && (
          <TransferSection
            transactionId={transaction.id}
            counterpart={props.counterpart}
            options={props.linkOptions}
            fmt={fmt}
          />
        )}
        {tab === 'history' && (
          <div className="flex flex-col gap-3">
            <HistoryBlock {...props} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Read-only summary: classification on the left, bank fields on the right. */
function Overview(props: DetailProps & { classifyHref: string }) {
  const { classification, transaction } = props;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={`${CARD_CLASS} flex flex-col gap-3 p-5`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Classification</h2>
          <Link href={props.classifyHref} className="text-sm underline">
            Edit
          </Link>
        </div>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-zinc-500">Payee</dt>
          <dd>{classification.payee?.name ?? '—'}</dd>
          <dt className="text-zinc-500">Category</dt>
          <dd>
            {transaction.transferId ? (
              'Transfer'
            ) : classification.splitLines.length > 0 ? (
              classification.splitLines.map((line) => categoryLabel(line.category)).join(', ')
            ) : classification.category ? (
              categoryLabel(classification.category)
            ) : (
              <span className="text-amber-700 dark:text-amber-400">Unclassified</span>
            )}
          </dd>
          <dt className="text-zinc-500">Tags</dt>
          <dd>{classification.tags.map((tag) => tag.name).join(', ') || '—'}</dd>
          <dt className="text-zinc-500">Notes</dt>
          <dd className="whitespace-pre-line">{classification.notes ?? '—'}</dd>
        </dl>
      </div>
      <div className={`${CARD_CLASS} flex flex-col gap-3 p-5`}>
        <h2 className="font-semibold">{transaction.isManual ? 'Details' : 'From the bank'}</h2>
        <BankFields {...props} dense />
        <BundledDetailsTable {...props} />
      </div>
    </div>
  );
}

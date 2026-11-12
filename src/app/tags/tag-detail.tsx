import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Menu } from '@/components/menu';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, DANGER_BUTTON_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { Tag, TagActivity } from '@/server/services/tags';
import type { TransactionListItem } from '@/server/services/transactions';
import { categoryText } from '@/app/transactions/transaction-display';
import { deleteTagAction, mergeTagAction, renameTagAction } from './actions';

interface TagDetailProps {
  tag: Tag;
  /** Every Tag, to merge into. */
  tags: Tag[];
  activity: TagActivity;
  /** Its latest Transactions, newest first. */
  recent: TransactionListItem[];
  fmt: Formatter;
}

const SECTION_HEADING = 'text-xs font-semibold tracking-wide text-faint uppercase';

function transactionsLabel(count: number): string {
  return `${count} Transaction${count === 1 ? '' : 's'}`;
}

/** The detail pane: one Tag's header and edits, its totals, Categories and latest Transactions. */
export function TagDetail({ tag, tags, activity, recent, fmt }: TagDetailProps) {
  const { id, name, transactionCount } = tag;
  const { firstDate, lastDate } = activity;
  const transactionsHref = `/transactions?tagId=${id}`;
  return (
    <section aria-label={`Tag ${name}`} className={`${CARD_CLASS} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="truncate font-display text-2xl tracking-tight">{name}</h2>
          <Link href={transactionsHref} className="text-sm text-faint hover:underline">
            {transactionsLabel(transactionCount)}
          </Link>
          {firstDate && lastDate && (
            <span className="text-sm text-faint tabular-nums">
              {firstDate === lastDate
                ? fmt.date(firstDate)
                : `${fmt.date(firstDate)} – ${fmt.date(lastDate)}`}
            </span>
          )}
          {transactionCount === 0 && (
            <span className="rounded-md bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/20 ring-inset">
              Unused
            </span>
          )}
        </div>
        <TagMenu tag={tag} tags={tags} />
      </div>

      <Totals activity={activity} fmt={fmt} />

      {activity.topCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
          <h3 className={SECTION_HEADING}>Mostly</h3>
          <ul aria-label={`Top Categories of ${name}`} className="flex flex-wrap gap-2">
            {activity.topCategories.map((category) => (
              <li key={category.name} className="rounded-md bg-sunken px-2 py-0.5 text-xs">
                {category.name} · {category.transactionCount}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className={`${SECTION_HEADING} px-4 pt-3`}>Recent Transactions</h3>
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-faint">
          No Transactions carry this Tag yet. Add it from a Transaction or with a Rule.
        </p>
      ) : (
        <ul aria-label={`Recent Transactions of ${name}`} className="divide-y divide-rule">
          {recent.map((transaction) => (
            <RecentRow key={transaction.id} transaction={transaction} fmt={fmt} />
          ))}
        </ul>
      )}
      {transactionCount > recent.length && (
        <Link
          href={transactionsHref}
          className="border-t border-rule px-4 py-3 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          All {transactionsLabel(transactionCount)} →
        </Link>
      )}
    </section>
  );
}

/** Net, out and in, one column per Currency (no conversion: a Tag can span Currencies). */
function Totals({ activity, fmt }: { activity: TagActivity; fmt: Formatter }) {
  if (activity.totals.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-10 gap-y-4 border-b border-rule p-4">
      {activity.totals.map(({ currency, outMinor, inMinor }) => (
        <div key={currency} className="flex flex-col gap-1">
          <dt className={SECTION_HEADING}>Net {currency}</dt>
          <dd className="font-display text-2xl tracking-tight tabular-nums">
            {fmt.amount(outMinor + inMinor, { currency })}
          </dd>
          <dd className="text-xs text-muted tabular-nums">
            out {fmt.amount(outMinor)} · in {fmt.amount(inMinor)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecentRow({ transaction, fmt }: { transaction: TransactionListItem; fmt: Formatter }) {
  const classification = categoryText(transaction);
  return (
    <li className="flex items-center gap-4 px-4 py-2.5 text-sm">
      <span className="w-24 shrink-0 text-muted tabular-nums">
        {fmt.date(transaction.bookingDate)}
      </span>
      <Link
        href={`/transactions/${transaction.id}`}
        className="min-w-0 flex-1 truncate hover:underline"
      >
        {transaction.rawDescription || '(no description)'}
        <span className="block truncate text-xs text-faint">
          {transaction.accountName} · {classification}
        </span>
      </Link>
      <span
        className={`shrink-0 tabular-nums ${transaction.amountMinor > 0 ? 'text-positive' : ''}`}
      >
        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
      </span>
    </li>
  );
}

/** Rename, merge and delete, behind one menu. */
function TagMenu({ tag, tags }: { tag: Tag; tags: Tag[] }) {
  const { id, name, transactionCount } = tag;
  const others = tags.filter((other) => other.id !== id);
  return (
    <Menu trigger="Edit Tag" triggerClassName={GHOST_BUTTON_CLASS}>
      <ActionForm action={renameTagAction.bind(null, id)} label={`Rename ${name}`}>
        <input
          name="name"
          aria-label={`Name of ${name}`}
          defaultValue={name}
          required
          maxLength={100}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <button type="submit" className={GHOST_BUTTON_CLASS}>
          Rename
        </button>
      </ActionForm>
      {others.length > 0 && (
        <ActionForm
          action={mergeTagAction.bind(null, id)}
          label={`Merge ${name}`}
          confirmMessage={`Give every Transaction of "${name}" the chosen Tag instead, and delete "${name}"?`}
        >
          <select
            name="targetId"
            aria-label={`Merge ${name} into`}
            required
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          >
            <option value="">Merge into…</option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
          <button type="submit" className={GHOST_BUTTON_CLASS}>
            Merge
          </button>
        </ActionForm>
      )}
      <div className="border-t border-rule pt-3">
        <ActionForm
          action={deleteTagAction.bind(null, id)}
          label={`Delete ${name}`}
          confirmMessage={
            transactionCount === 0
              ? `Delete "${name}"?`
              : `Delete "${name}"? It is removed from ${transactionsLabel(transactionCount)}.`
          }
        >
          <button type="submit" className={DANGER_BUTTON_CLASS}>
            Delete Tag
          </button>
        </ActionForm>
      </div>
    </Menu>
  );
}

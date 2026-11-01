// PROTOTYPE — variant A "Inbox": master / detail like Rules and Transactions. The queue of
// groups on the left (always visible), the picked group with its bulk edit on the right.
import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import { BulkEditForm } from '../bulk-edit-form';
import { dateRange, distinct, label, protoHref, totals, type VariantProps } from './shared';

export const name = 'Inbox';

export function VariantA({ variant, progress, groupPage, openKey, open, fmt }: VariantProps) {
  const { groups, totalGroups, page, pageCount } = groupPage;
  const largest = groups[0]?.count ?? 1;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Unclassified</h1>
          <p className="text-sm text-zinc-500">
            {progress.unclassified} Transactions in {totalGroups} groups ·{' '}
            {fmt.percent(progress.share)} of all, target {fmt.percent(progress.target)}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            progress.isTargetMet
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          }`}
        >
          {progress.isTargetMet ? 'Target met' : 'Above target'}
        </span>
      </header>

      {totalGroups === 0 ? (
        <p className="text-sm text-zinc-500">Inbox zero. Nothing left to classify.</p>
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
          <nav aria-label="Unclassified groups" className={`${CARD_CLASS} overflow-hidden`}>
            <ul className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
              {groups.map((group) => {
                const isOpen = group.key === openKey;
                return (
                  <li key={group.key}>
                    <Link
                      href={protoHref(variant, { page, group: group.key })}
                      aria-current={isOpen ? 'true' : undefined}
                      className={`flex flex-col gap-1 px-4 py-2.5 ${
                        isOpen
                          ? 'bg-zinc-100 dark:bg-zinc-800'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">
                          {label(group.description)}
                        </span>
                        <span className="text-sm tabular-nums">{group.count}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <span
                            className="block h-1 rounded-full bg-zinc-400"
                            style={{ width: `${(group.count / largest) * 100}%` }}
                          />
                        </span>
                        <span className="text-xs text-zinc-500 tabular-nums">
                          {fmt.date(group.latestBookingDate)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-xs dark:border-zinc-800">
                {page > 1 ? (
                  <Link href={protoHref(variant, { page: page - 1 })}>← Previous</Link>
                ) : (
                  <span />
                )}
                <span>
                  {page} / {pageCount}
                </span>
                {page < pageCount ? (
                  <Link href={protoHref(variant, { page: page + 1 })}>Next →</Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </nav>

          {open ? (
            <article className={`${CARD_CLASS} flex flex-col gap-5 p-5`}>
              <header className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">{open.description}</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Fact term="Transactions" value={String(open.members.total)} />
                  <Fact term="Total" value={totals(open, fmt)} />
                  <Fact term="Dates" value={dateRange(open, fmt)} />
                  <Fact
                    term="Counterparties"
                    value={
                      distinct(open.members.transactions.map((t) => t.counterpartyName))
                        .slice(0, 2)
                        .join(', ') || '—'
                    }
                  />
                </dl>
              </header>
              {open.members.total === 0 ? (
                <p className="text-sm text-zinc-500">This group has no Unclassified left.</p>
              ) : (
                <BulkEditForm
                  key={open.key}
                  description={open.description}
                  transactions={open.members.transactions}
                  groupCount={open.members.total}
                  groups={open.categoryGroups}
                  payeeNames={open.payeeNames}
                  action={open.action}
                />
              )}
            </article>
          ) : (
            <p className="text-sm text-zinc-500">Pick a group.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-zinc-500">{term}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

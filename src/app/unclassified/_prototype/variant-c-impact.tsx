// PROTOTYPE — variant C "Impact": the page is framed around the 2% target. A big countdown,
// then the groups as a ranked bar list with a line where the target would be met; a group
// expands in place (accordion) with its bulk edit.
import Link from 'next/link';
import { Fragment } from 'react';
import { BulkEditForm } from '../bulk-edit-form';
import { label, protoHref, toGo, totals, type VariantProps } from './shared';

export const name = 'Impact';

export function VariantC({ variant, progress, groupPage, openKey, open, fmt }: VariantProps) {
  const { groups, totalGroups, page, pageCount } = groupPage;
  const remaining = toGo(progress);
  const largest = groups[0]?.count ?? 1;

  const cutoff = page === 1 && remaining > 0 ? targetCutoff(groups, remaining) : -1;
  const groupsToTarget = cutoff + 1;

  return (
    <section className="flex flex-col gap-8">
      <header className="grid gap-6 rounded-2xl bg-zinc-900 p-8 text-white md:grid-cols-[1fr_auto] dark:bg-zinc-100 dark:text-zinc-900">
        <div className="flex flex-col gap-2">
          <h1 className="text-sm font-medium tracking-wide uppercase opacity-70">Unclassified</h1>
          {remaining > 0 ? (
            <p className="text-3xl font-semibold">
              Classify <span className="tabular-nums">{remaining}</span> more Transactions to reach{' '}
              {fmt.percent(progress.target)}
              {groupsToTarget > 0 && (
                <span className="block text-lg font-normal opacity-70">
                  The top {groupsToTarget} group{groupsToTarget === 1 ? '' : 's'} below get you
                  there.
                </span>
              )}
            </p>
          ) : (
            <p className="text-3xl font-semibold">Target met. Keep it under control.</p>
          )}
        </div>
        <div className="flex flex-col items-end justify-center">
          <span className="text-5xl font-semibold tabular-nums">{fmt.percent(progress.share)}</span>
          <span className="text-sm opacity-70">
            {progress.unclassified} of {progress.total} Unclassified
          </span>
        </div>
      </header>

      {totalGroups === 0 ? (
        <p className="text-sm text-zinc-500">Nothing left to classify.</p>
      ) : (
        <ol aria-label="Unclassified groups" className="flex flex-col">
          {groups.map((group, index) => {
            const isOpen = group.key === openKey;
            const isInTarget = index <= cutoff;
            return (
              <Fragment key={group.key}>
                <li
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${isOpen ? 'bg-zinc-50 dark:bg-zinc-900' : ''}`}
                >
                  <Link
                    href={
                      isOpen
                        ? protoHref(variant, { page })
                        : protoHref(variant, { page, group: group.key })
                    }
                    aria-expanded={isOpen}
                    className="grid grid-cols-[2rem_minmax(0,16rem)_1fr_3rem] items-center gap-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="text-right text-xs text-zinc-400 tabular-nums">
                      {(page - 1) * groupPage.pageSize + index + 1}
                    </span>
                    <span className="truncate font-medium">{label(group.description)}</span>
                    <span className="h-3 rounded-sm bg-zinc-100 dark:bg-zinc-800">
                      <span
                        className={`block h-3 rounded-sm ${isInTarget ? 'bg-amber-500' : 'bg-zinc-400'}`}
                        style={{ width: `${(group.count / largest) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{group.count}</span>
                  </Link>
                  {isOpen && open && (
                    <div className="flex flex-col gap-3 px-11 pt-2 pb-6">
                      <p className="text-sm text-zinc-500">
                        Latest {fmt.date(group.latestBookingDate)} · total {totals(open, fmt)}
                      </p>
                      <BulkEditForm
                        key={open.key}
                        description={open.description}
                        transactions={open.members.transactions}
                        groupCount={open.members.total}
                        groups={open.categoryGroups}
                        payeeNames={open.payeeNames}
                        action={open.action}
                      />
                    </div>
                  )}
                </li>
                {index === cutoff && (
                  <li
                    aria-hidden
                    className="flex items-center gap-3 py-2 text-xs font-medium text-amber-600"
                  >
                    <span className="h-px flex-1 border-t-2 border-dashed border-amber-500" />
                    {fmt.percent(progress.target)} target reached here
                    <span className="h-px flex-1 border-t-2 border-dashed border-amber-500" />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={protoHref(variant, { page: page - 1 })}>← Previous</Link>}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount && <Link href={protoHref(variant, { page: page + 1 })}>Next →</Link>}
        </nav>
      )}
    </section>
  );
}

/** Index of the last group (largest first) needed to classify `remaining`; -1 if never. */
function targetCutoff(groups: { count: number }[], remaining: number): number {
  const running = groups.map((_, i) => groups.slice(0, i + 1).reduce((s, g) => s + g.count, 0));
  return running.findIndex((sum) => sum >= remaining);
}

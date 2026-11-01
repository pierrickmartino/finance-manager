import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { UnclassifiedGroupPage } from '@/server/services/transactions/unclassified';
import { unclassifiedHref } from './view';

interface GroupListProps {
  groupPage: UnclassifiedGroupPage;
  selectedKey: string | undefined;
  fmt: Formatter;
}

/** The master list: Unclassified groups, largest first, each with a bar sized to its count. */
export function GroupList({ groupPage, selectedKey, fmt }: GroupListProps) {
  const { groups, page, pageCount } = groupPage;
  // Bars are relative to the largest group overall, which leads the first page.
  const largest = Math.max(1, ...groups.map((group) => group.count));

  return (
    <nav aria-label="Unclassified groups" className={`${CARD_CLASS} overflow-hidden`}>
      <ul className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
        {groups.map((group) => {
          const isSelected = group.key === selectedKey;
          return (
            <li key={group.key}>
              <Link
                href={unclassifiedHref({ page, group: group.key })}
                aria-current={isSelected ? 'true' : undefined}
                className={`flex flex-col gap-1 px-4 py-2.5 ${
                  isSelected
                    ? 'bg-zinc-100 dark:bg-zinc-800'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {group.description || '(no description)'}
                  </span>
                  <span className="text-sm tabular-nums">{group.count}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-1 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800"
                  >
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
        <div
          role="navigation"
          aria-label="Pages"
          className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-xs dark:border-zinc-800"
        >
          {page > 1 ? (
            <Link href={unclassifiedHref({ page: page - 1 })}>← Previous</Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={unclassifiedHref({ page: page + 1 })}>Next →</Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </nav>
  );
}

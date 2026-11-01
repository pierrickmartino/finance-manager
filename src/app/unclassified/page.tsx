import type { Metadata } from 'next';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import {
  getClassificationProgress,
  listUnclassifiedGroups,
  type ClassificationProgress,
} from '@/server/services/transactions/unclassified';
import { GroupDetail } from './group-detail';
import { GroupList } from './group-list';
import { selectedGroupKey } from './view';

export const metadata: Metadata = { title: 'Unclassified · Finance Manager' };

interface UnclassifiedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/**
 * The classification work queue (spec 60-62, 68) as master / detail: the Unclassified
 * Transactions grouped by normalised description, largest first, on the left; the selected
 * group (`?group=`, else the largest) with its bulk edit on the right. The header says how much
 * is left against the 2% target.
 */
export default async function UnclassifiedPage({ searchParams }: UnclassifiedPageProps) {
  const params = await searchParams;
  const page = pageNumber(single(params.page));
  const ctx = await getServiceContext();
  const [progress, groupPage, fmt] = await Promise.all([
    getClassificationProgress(ctx),
    listUnclassifiedGroups(ctx, { page }),
    getFormatter(),
  ]);
  const selectedKey = selectedGroupKey(groupPage.groups, single(params.group));

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Unclassified</h1>
          <Progress progress={progress} groupCount={groupPage.totalGroups} fmt={fmt} />
        </div>
        <TargetBadge isTargetMet={progress.isTargetMet} />
      </header>

      {selectedKey === undefined ? (
        <p className="text-sm text-zinc-500">Nothing left to classify.</p>
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
          {groupPage.totalGroups > 0 ? (
            <GroupList groupPage={groupPage} selectedKey={selectedKey} fmt={fmt} />
          ) : (
            <p className="text-sm text-zinc-500">Nothing left to classify.</p>
          )}
          <GroupDetail key={selectedKey} groupKey={selectedKey} fmt={fmt} />
        </div>
      )}
    </section>
  );
}

interface ProgressProps {
  progress: ClassificationProgress;
  groupCount: number;
  fmt: Formatter;
}

function Progress({ progress, groupCount, fmt }: ProgressProps) {
  const { total, unclassified, share, target } = progress;
  return (
    <section aria-label="Classification progress" className="text-sm text-zinc-500">
      <p>
        <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
          {fmt.percent(share)}
        </span>{' '}
        of Transactions Unclassified{' '}
        <span className="tabular-nums">
          ({unclassified} of {total}, in {groupCount} group{groupCount === 1 ? '' : 's'})
        </span>
        . Target: {fmt.percent(target)} or less.
      </p>
    </section>
  );
}

function TargetBadge({ isTargetMet }: { isTargetMet: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        isTargetMet
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      }`}
    >
      {isTargetMet ? 'Target met' : 'Above target · classify the largest groups first'}
    </span>
  );
}

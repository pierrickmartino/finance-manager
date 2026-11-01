import type { Metadata } from 'next';
import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listCategoryGroups } from '@/server/services/categories';
import { listPayees } from '@/server/services/payees';
import {
  getClassificationProgress,
  listUnclassifiedGroups,
  listUnclassifiedGroupTransactions,
  type ClassificationProgress,
  type UnclassifiedGroup,
  type UnclassifiedGroupPage,
} from '@/server/services/transactions/unclassified';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { bulkEditAction } from './actions';
import { BulkEditForm } from './bulk-edit-form';
import type { OpenGroupData } from './_prototype/shared';
import { VariantA, name as nameA } from './_prototype/variant-a-inbox';
import { VariantB, name as nameB } from './_prototype/variant-b-focus';
import { VariantC, name as nameC } from './_prototype/variant-c-impact';

// PROTOTYPE — three Unclassified page layouts on /unclassified, switchable via ?variant= (A, B,
// C; default "current" is today's page) and a floating bar. The switch and the bar are disabled
// in production builds. Not for main: fold the winner in, then drop `_prototype/` and the bar.
const VARIANTS = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: nameA },
  { key: 'B', name: nameB },
  { key: 'C', name: nameC },
];

export const metadata: Metadata = { title: 'Unclassified · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

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

function unclassifiedHref(params: { page?: number; group?: string }): string {
  const search = new URLSearchParams();
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.group !== undefined) search.set('group', params.group);
  const query = search.toString();
  return query ? `/unclassified?${query}` : '/unclassified';
}

/**
 * The classification work queue (spec 60-62, 68): how much is left against the 2% target, the
 * Unclassified Transactions grouped by normalised description (largest first), and a bulk
 * edit for the expanded group.
 */
export default async function UnclassifiedPage({ searchParams }: UnclassifiedPageProps) {
  const params = await searchParams;
  const page = pageNumber(single(params.page));
  const openKey = single(params.group);
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  const [progress, groupPage] = await Promise.all([
    getClassificationProgress(ctx),
    listUnclassifiedGroups(ctx, { page }),
  ]);

  const requested = single(params.variant);
  const variant =
    process.env.NODE_ENV !== 'production' && VARIANTS.some((v) => v.key === requested)
      ? requested!
      : 'current';
  if (variant !== 'current') {
    const keys = groupPage.groups.map((group) => group.key);
    // A and B always show a group: the one named if it is still listed, else the largest.
    const key =
      variant === 'C'
        ? openKey
        : openKey !== undefined && keys.includes(openKey)
          ? openKey
          : keys[0];
    const props = {
      variant,
      progress,
      groupPage,
      openKey: key,
      open: key === undefined ? null : await loadOpenGroup(key),
      fmt,
    };
    return (
      <>
        {variant === 'A' && <VariantA {...props} />}
        {variant === 'B' && <VariantB {...props} />}
        {variant === 'C' && <VariantC {...props} />}
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Unclassified</h1>
      <Progress progress={progress} fmt={fmt} />
      {openKey !== undefined && <OpenGroup groupKey={openKey} page={page} />}
      <Groups groupPage={groupPage} openKey={openKey} fmt={fmt} />
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </section>
  );
}

function Progress({ progress, fmt }: { progress: ClassificationProgress; fmt: Formatter }) {
  const { total, unclassified, share, target, isTargetMet } = progress;
  return (
    <section aria-label="Classification progress" className="flex max-w-xl flex-col gap-2">
      <p className="text-lg">
        <span className="font-semibold tabular-nums">{fmt.percent(share)}</span> of Transactions
        Unclassified{' '}
        <span className="text-sm text-zinc-500 tabular-nums">
          ({unclassified} of {total})
        </span>
      </p>
      <meter
        aria-label="Share Unclassified"
        min={0}
        max={1}
        low={target}
        high={target}
        optimum={0}
        value={share}
        className="h-2 w-full"
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Target: {fmt.percent(target)} or less.{' '}
        {isTargetMet ? 'Target met.' : 'Classify the largest groups first.'}
      </p>
    </section>
  );
}

interface GroupsProps {
  groupPage: UnclassifiedGroupPage;
  openKey: string | undefined;
  fmt: Formatter;
}

function Groups({ groupPage, openKey, fmt }: GroupsProps) {
  const { groups, totalGroups, page, pageCount } = groupPage;
  if (totalGroups === 0) {
    return <p className="text-sm text-zinc-500">Nothing left to classify.</p>;
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {totalGroups} group{totalGroups === 1 ? '' : 's'}
      </h2>
      <div className="overflow-x-auto">
        <table aria-label="Unclassified groups" className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className={CELL}>Description</th>
              <th className={`${CELL} text-right`}>Transactions</th>
              <th className={CELL}>Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {groups.map((group) => (
              <GroupRow
                key={group.key}
                group={group}
                page={page}
                isOpen={group.key === openKey}
                fmt={fmt}
              />
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={unclassifiedHref({ page: page - 1 })}>← Previous</Link>}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount && <Link href={unclassifiedHref({ page: page + 1 })}>Next →</Link>}
        </nav>
      )}
    </section>
  );
}

interface GroupRowProps {
  group: UnclassifiedGroup;
  page: number;
  isOpen: boolean;
  fmt: Formatter;
}

function GroupRow({ group, page, isOpen, fmt }: GroupRowProps) {
  const label = group.description || '(no description)';
  return (
    <tr className={isOpen ? 'bg-zinc-100 dark:bg-zinc-900' : undefined}>
      <td className={CELL}>
        <Link
          href={unclassifiedHref({ page, group: group.key })}
          aria-current={isOpen ? 'true' : undefined}
          className="hover:underline"
        >
          {label}
        </Link>
      </td>
      <td className={`${CELL} text-right tabular-nums`}>{group.count}</td>
      <td className={`${CELL} whitespace-nowrap tabular-nums`}>
        {fmt.date(group.latestBookingDate)}
      </td>
    </tr>
  );
}

/** The expanded group: its Transactions and the bulk edit. */
async function OpenGroup({ groupKey, page }: { groupKey: string; page: number }) {
  const ctx = await getServiceContext();
  const [members, categoryGroups, payees] = await Promise.all([
    listUnclassifiedGroupTransactions(ctx, groupKey),
    listCategoryGroups(ctx),
    listPayees(ctx),
  ]);
  const description = members.transactions[0]?.rawDescription || groupKey || '(no description)';

  return (
    <section
      aria-label={`Group ${description}`}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{description}</h2>
        <Link href={unclassifiedHref({ page })} className="text-sm text-zinc-500 hover:underline">
          Close
        </Link>
      </div>
      {members.total === 0 ? (
        <p className="text-sm text-zinc-500">This group has no Unclassified Transactions left.</p>
      ) : (
        <>
          {members.total > members.transactions.length && (
            <p className="text-sm text-zinc-500">
              Showing the {members.transactions.length} newest of {members.total}. Classify all
              applies to every one of them.
            </p>
          )}
          <BulkEditForm
            description={description}
            transactions={members.transactions}
            groupCount={members.total}
            groups={categoryGroups}
            payeeNames={payees.map((payee) => payee.name)}
            action={bulkEditAction.bind(null, groupKey)}
          />
        </>
      )}
    </section>
  );
}

/** PROTOTYPE — the open group's data for the variants. */
async function loadOpenGroup(key: string): Promise<OpenGroupData> {
  const ctx = await getServiceContext();
  const [members, categoryGroups, payees] = await Promise.all([
    listUnclassifiedGroupTransactions(ctx, key),
    listCategoryGroups(ctx),
    listPayees(ctx),
  ]);
  return {
    key,
    description: members.transactions[0]?.rawDescription || key || '(no description)',
    members,
    categoryGroups,
    payeeNames: payees.map((payee) => payee.name),
    action: bulkEditAction.bind(null, key),
  };
}

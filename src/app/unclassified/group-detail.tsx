import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { listCategoryGroups } from '@/server/services/categories';
import { listPayees } from '@/server/services/payees';
import { listUnclassifiedGroupTransactions } from '@/server/services/transactions/unclassified';
import { bulkEditAction } from './actions';
import { BulkEditForm } from './bulk-edit-form';
import { groupFacts, unclassifiedHref } from './view';

interface GroupDetailProps {
  groupKey: string;
  fmt: Formatter;
}

/** The detail pane: the selected group's key facts, its Transactions and the bulk edit. */
export async function GroupDetail({ groupKey, fmt }: GroupDetailProps) {
  const ctx = await getServiceContext();
  const [members, categoryGroups, payees] = await Promise.all([
    listUnclassifiedGroupTransactions(ctx, groupKey),
    listCategoryGroups(ctx),
    listPayees(ctx),
  ]);
  const description = members.transactions[0]?.rawDescription || groupKey || '(no description)';

  if (members.total === 0) {
    return (
      <article
        aria-label={`Group ${description}`}
        className={`${CARD_CLASS} flex flex-col gap-2 p-5`}
      >
        <p className="text-sm text-zinc-500">This group has no Unclassified Transactions left.</p>
        <Link href={unclassifiedHref({})} className="text-sm font-medium hover:underline">
          Next group →
        </Link>
      </article>
    );
  }

  const isPartial = members.total > members.transactions.length;
  const facts = groupFacts(members.transactions);
  const dates = [facts.firstDate, facts.lastDate]
    .filter((date): date is string => date !== undefined)
    .map((date) => fmt.date(date));
  const total = facts.totals
    .map(({ currency, amountMinor }) => fmt.amount(amountMinor, { currency }))
    .join(' + ');

  return (
    <article
      aria-label={`Group ${description}`}
      className={`${CARD_CLASS} flex flex-col gap-5 p-5`}
    >
      <header className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold break-words">{description}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact term="Transactions" value={String(members.total)} />
          <Fact term={isPartial ? 'Total of those shown' : 'Total'} value={total} />
          <Fact term="Dates" value={dates[0] === dates[1] ? dates[0]! : dates.join(' – ')} />
          <Fact
            term="Counterparties"
            value={facts.counterparties.slice(0, 2).join(', ') || '—'}
            title={facts.counterparties.join(', ')}
          />
        </dl>
        {isPartial && (
          <p className="text-sm text-zinc-500">
            Showing the {members.transactions.length} newest of {members.total}. Classify all
            applies to every one of them.
          </p>
        )}
      </header>
      <BulkEditForm
        // A fresh form (no ticks, no typed values) for each group.
        key={groupKey}
        description={description}
        transactions={members.transactions}
        groupCount={members.total}
        groups={categoryGroups}
        payeeNames={payees.map((payee) => payee.name)}
        action={bulkEditAction.bind(null, groupKey)}
      />
    </article>
  );
}

function Fact({ term, value, title }: { term: string; value: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-zinc-500">{term}</dt>
      <dd className="font-medium break-words tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  );
}

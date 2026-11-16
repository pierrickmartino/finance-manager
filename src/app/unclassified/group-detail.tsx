import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { listCategoryGroups } from '@/server/services/categories';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import { listUnclassifiedGroupTransactions } from '@/server/services/transactions/unclassified';
import { GroupTransactions } from './group-transactions';
import { groupFacts } from './view';

interface GroupDetailProps {
  groupKey: string;
  fmt: Formatter;
}

/** The detail pane: the selected group's key facts, its Transactions and the Bulk edit bar. */
export async function GroupDetail({ groupKey, fmt }: GroupDetailProps) {
  const ctx = await getServiceContext();
  const [members, categoryGroups, payees, tags] = await Promise.all([
    listUnclassifiedGroupTransactions(ctx, groupKey),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
  ]);
  const description = members.transactions[0]?.rawDescription || groupKey || '(no description)';

  return (
    <article
      aria-label={`Group ${description}`}
      className={`${CARD_CLASS} flex flex-col gap-5 p-5`}
    >
      {members.total > 0 && <GroupHeader description={description} members={members} fmt={fmt} />}
      {/* Rendered for an emptied group too, so the bar keeps the last edit's result. */}
      <GroupTransactions
        groupKey={groupKey}
        description={description}
        transactions={members.transactions}
        groupCount={members.total}
        lists={{ groups: categoryGroups, payeeNames: payees.map((payee) => payee.name), tags }}
      />
    </article>
  );
}

interface GroupHeaderProps {
  description: string;
  members: Awaited<ReturnType<typeof listUnclassifiedGroupTransactions>>;
  fmt: Formatter;
}

function GroupHeader({ description, members, fmt }: GroupHeaderProps) {
  const isPartial = members.total > members.transactions.length;
  const facts = groupFacts(members.transactions);
  const dates = [facts.firstDate, facts.lastDate]
    .filter((date): date is string => date !== undefined)
    .map((date) => fmt.date(date));
  const total = facts.totals
    .map(({ currency, amountMinor }) => fmt.amount(amountMinor, { currency }))
    .join(' + ');

  return (
    <header className="flex flex-col gap-3">
      <h2 className="font-display text-2xl tracking-tight break-words">{description}</h2>
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
        <p className="text-sm text-muted">
          Showing the {members.transactions.length} newest of {members.total}. Select all{' '}
          {members.total} applies to every one of them.
        </p>
      )}
    </header>
  );
}

function Fact({ term, value, title }: { term: string; value: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted">{term}</dt>
      <dd className="font-medium break-words tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  );
}

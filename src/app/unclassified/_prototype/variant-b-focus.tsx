// PROTOTYPE — variant B "Focus": one group at a time, like a triage deck. The group fills the
// page, its Categories are one-click chips, and Skip moves on. Classifying a group advances to
// the next largest automatically.
import Link from 'next/link';
import { BulkEditForm } from '../bulk-edit-form';
import { QuickPick } from './quick-pick';
import { dateRange, distinct, label, protoHref, toGo, totals, type VariantProps } from './shared';

export const name = 'Focus';

const SAMPLE_SIZE = 4;

export function VariantB({ variant, progress, groupPage, openKey, open, fmt }: VariantProps) {
  const { groups, totalGroups, page } = groupPage;
  const index = groups.findIndex((group) => group.key === openKey);
  const next = groups[index + 1];
  const previous = index > 0 ? groups[index - 1] : undefined;
  const upNext = groups.slice(index + 1, index + 4);
  const remaining = toGo(progress);

  if (totalGroups === 0 || !open) {
    return (
      <section className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-24 text-center">
        <p className="text-4xl">✓</p>
        <h1 className="text-2xl font-semibold">All caught up</h1>
        <p className="text-sm text-zinc-500">Nothing left to classify.</p>
      </section>
    );
  }

  const sample = open.members.transactions.slice(0, SAMPLE_SIZE);
  const counterparties = distinct(open.members.transactions.map((t) => t.counterpartyName));

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm text-zinc-500">
          <span>
            Group {(page - 1) * groupPage.pageSize + index + 1} of {totalGroups}
          </span>
          <span>
            {remaining > 0
              ? `${remaining} Transactions to go for ${fmt.percent(progress.target)}`
              : 'Target met'}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-1.5 rounded-full bg-emerald-500"
            style={{ width: `${(1 - progress.share) * 100}%` }}
          />
        </div>
      </div>

      <article className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {open.members.total} Transactions · {dateRange(open, fmt)} · {totals(open, fmt)}
          </p>
          <h1 className="font-mono text-2xl font-semibold break-all">{open.description}</h1>
          {counterparties.length > 0 && (
            <p className="text-sm text-zinc-500">Counterparty: {counterparties.join(', ')}</p>
          )}
        </header>

        <ul className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
          {sample.map((t) => (
            <li key={t.id} className="flex justify-between gap-4">
              <span className="text-zinc-500 tabular-nums">{fmt.date(t.bookingDate)}</span>
              <span className="flex-1 truncate">{t.accountName}</span>
              <span className="tabular-nums">
                {fmt.amount(t.amountMinor, { currency: t.currency })}
              </span>
            </li>
          ))}
          {open.members.total > sample.length && (
            <li className="text-xs text-zinc-500">+ {open.members.total - sample.length} more</li>
          )}
        </ul>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Classify all {open.members.total} as…</h2>
          <QuickPick
            key={open.key}
            groups={open.categoryGroups}
            payeeNames={open.payeeNames}
            suggestedPayee={counterparties[0] ?? ''}
            action={open.action}
          />
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">
            Pick Transactions, add Tags, or create a Rule…
          </summary>
          <div className="pt-4">
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
        </details>
      </article>

      <nav className="flex items-center justify-between text-sm">
        {previous ? (
          <Link
            href={protoHref(variant, { page, group: previous.key })}
            className="text-zinc-500 hover:underline"
          >
            ← Back
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={protoHref(variant, { page, group: next.key })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Skip →
          </Link>
        )}
      </nav>

      {upNext.length > 0 && (
        <aside className="flex flex-col gap-1 text-sm text-zinc-500">
          <h2 className="text-xs font-medium tracking-wide uppercase">Up next</h2>
          {upNext.map((group) => (
            <p key={group.key} className="flex justify-between">
              <span className="truncate">{label(group.description)}</span>
              <span className="tabular-nums">{group.count}</span>
            </p>
          ))}
        </aside>
      )}
    </section>
  );
}

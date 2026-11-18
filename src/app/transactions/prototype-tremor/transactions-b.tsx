'use client';
/**
 * PROTOTYPE (Tremor redesign) Transactions B, "Report tabs": a feed, not a table. Accounts are
 * underline tabs across the top; Transactions are grouped by day with each day's net; a sticky
 * side column summarises the filtered set (in vs out, a BarList of where it went). Reads like a
 * bank statement. Throwaway.
 */
import Link from 'next/link';
import { BarList } from '@/components/tremor-prototype/BarList';
import { CategoryBar } from '@/components/tremor-prototype/CategoryBar';
import { Divider } from '@/components/tremor-prototype/Divider';
import { cx } from '@/components/tremor-prototype/cx';
import { longDate, money, money0 } from '@/components/tremor-prototype/format';
import type {
  ProtoTransaction,
  ProtoTransactionFilter,
  ProtoTransactionPage,
} from '@/server/prototype-tremor-data';

function href(filter: ProtoTransactionFilter, patch: Partial<ProtoTransactionFilter>) {
  const next = { ...filter, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) p.set(k, String(v));
  return `?${p}`;
}

export function TransactionsB({
  data,
  filter,
}: {
  data: ProtoTransactionPage;
  filter: ProtoTransactionFilter;
}) {
  const days = new Map<string, ProtoTransaction[]>();
  for (const t of data.transactions) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  const tabs = ['', ...data.accounts];
  const flow = data.inflow + data.outflow || 1;

  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight text-ink">Transactions</h1>
      <nav
        aria-label="Accounts"
        className="mt-6 flex gap-6 overflow-x-auto border-b border-rule text-sm"
      >
        {tabs.map((a) => {
          const active = (filter.account ?? '') === a;
          return (
            <Link
              key={a || 'all'}
              href={href(filter, { account: a || undefined, page: undefined })}
              aria-current={active ? 'page' : undefined}
              className={cx(
                '-mb-px border-b-2 pb-2.5 whitespace-nowrap',
                active
                  ? 'border-accent-ink font-medium text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {a || 'All Accounts'}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <form className="flex gap-2">
            {filter.account && <input type="hidden" name="account" value={filter.account} />}
            <input
              name="q"
              defaultValue={filter.q}
              placeholder="Search this statement…"
              className="w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-lg text-ink placeholder:text-faint focus:border-ink focus:ring-0"
            />
          </form>
          {filter.category && (
            <p className="mt-3 text-sm text-muted">
              Showing{' '}
              <strong className="text-ink">
                {filter.category === '__none' ? 'Unclassified' : filter.category}
              </strong>{' '}
              ·{' '}
              <Link
                href={href(filter, { category: undefined, page: undefined })}
                className="underline"
              >
                show all
              </Link>
            </p>
          )}
          {[...days].map(([date, items]) => {
            const net = items.reduce((s, t) => s + t.amount, 0);
            return (
              <section key={date} className="mt-8">
                <header className="flex items-baseline justify-between border-b border-ink pb-1.5">
                  <h2 className="text-sm font-semibold text-ink">{longDate(date)}</h2>
                  <span
                    className={cx('text-sm tabular-nums', net > 0 ? 'text-positive' : 'text-muted')}
                  >
                    {money(net)}
                  </span>
                </header>
                <ul className="divide-y divide-rule">
                  {items.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/transactions/${t.id}`}
                        className="flex items-center gap-4 py-3 hover:bg-sunken/60"
                      >
                        <span
                          aria-hidden="true"
                          className={cx(
                            'grid size-9 shrink-0 place-items-center rounded-full text-sm font-medium',
                            t.amount > 0
                              ? 'bg-positive-tint text-positive'
                              : 'bg-sunken text-ink-soft',
                          )}
                        >
                          {(t.payee ?? t.description).slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">
                            {t.payee ?? t.description}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {t.category ?? <span className="text-warning">Unclassified</span>} ·{' '}
                            {t.account}
                          </span>
                        </span>
                        <span
                          className={cx(
                            'font-medium tabular-nums',
                            t.amount > 0 ? 'text-positive' : 'text-ink',
                          )}
                        >
                          {money(t.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <div className="mt-10 flex justify-center gap-6 text-sm">
            {data.page > 1 && (
              <Link href={href(filter, { page: data.page - 1 })} className="text-ink underline">
                Newer
              </Link>
            )}
            <span className="text-muted">
              Page {data.page} of {data.pageCount}
            </span>
            {data.page < data.pageCount && (
              <Link href={href(filter, { page: data.page + 1 })} className="text-ink underline">
                Older
              </Link>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm text-muted">{data.total} Transactions</p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted">In</dt>
              <dd className="font-display text-xl tabular-nums text-positive">
                {money0(data.inflow)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Out</dt>
              <dd className="font-display text-xl tabular-nums text-ink">{money0(data.outflow)}</dd>
            </div>
          </dl>
          <CategoryBar
            className="mt-3"
            values={[
              Math.round((data.inflow / flow) * 100),
              Math.round((data.outflow / flow) * 100),
            ]}
            colors={['positive', 'navy']}
            showLabels={false}
          />
          <Divider />
          <h2 className="text-sm font-semibold text-ink">Where it went</h2>
          <BarList
            className="mt-3"
            data={data.byCategory.map((c) => ({
              name: c.name,
              value: c.value,
              href: href(filter, {
                category: c.name === 'Unclassified' ? '__none' : c.name,
                page: undefined,
              }),
            }))}
            valueFormatter={money0}
          />
        </aside>
      </div>
    </div>
  );
}

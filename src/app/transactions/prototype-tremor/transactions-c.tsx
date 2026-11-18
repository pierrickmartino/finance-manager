'use client';
/**
 * PROTOTYPE (Tremor redesign) Transactions C, "Icon rail + inspector": master / detail at full
 * density. Facets as chip rows above a compact grid (32px rows, no cards), and a fixed inspector
 * on the right that shows the selected Transaction (j / k move the selection). The search lives
 * in the shell's command bar. Throwaway.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/tremor-prototype/Badge';
import { Divider } from '@/components/tremor-prototype/Divider';
import { cx } from '@/components/tremor-prototype/cx';
import { longDate, money, shortDate } from '@/components/tremor-prototype/format';
import type { ProtoTransactionFilter, ProtoTransactionPage } from '@/server/prototype-tremor-data';

interface Props {
  data: ProtoTransactionPage;
  filter: ProtoTransactionFilter;
  selectedId: string | null;
}

function href(filter: ProtoTransactionFilter, patch: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filter, ...patch })) if (v) p.set(k, String(v));
  return `?${p}`;
}

function Chip({
  active,
  to,
  children,
}: {
  active: boolean;
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      scroll={false}
      className={cx(
        'rounded-md px-2 py-0.5 text-xs whitespace-nowrap ring-1 ring-inset',
        active
          ? 'bg-ink text-paper ring-ink'
          : 'bg-surface text-ink-soft ring-rule-strong hover:bg-sunken',
      )}
    >
      {children}
    </Link>
  );
}

export function TransactionsC({ data, filter, selectedId }: Props) {
  const router = useRouter();
  const index = Math.max(
    0,
    data.transactions.findIndex((t) => t.id === selectedId),
  );
  const selected = data.transactions[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const step = e.key === 'j' ? 1 : e.key === 'k' ? -1 : 0;
      const next = data.transactions[index + step];
      if (step && next) router.replace(href(filter, { tx: next.id }), { scroll: false });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 overflow-hidden rounded-lg border border-rule bg-surface">
        <div className="flex flex-col gap-2 border-b border-rule p-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold text-ink">Transactions</h1>
            <span className="text-xs text-muted">
              {data.total} · in <span className="text-positive">{money(data.inflow)}</span> · out{' '}
              {money(-data.outflow)}
              {filter.q && <> · matching “{filter.q}”</>}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-xs text-muted">Account</span>
            <Chip
              active={!filter.account}
              to={href(filter, { account: undefined, page: undefined, tx: undefined })}
            >
              All
            </Chip>
            {data.accounts.map((a) => (
              <Chip
                key={a}
                active={filter.account === a}
                to={href(filter, { account: a, page: undefined, tx: undefined })}
              >
                {a}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-xs text-muted">Category</span>
            <Chip
              active={!filter.category}
              to={href(filter, { category: undefined, page: undefined, tx: undefined })}
            >
              All
            </Chip>
            <Chip
              active={filter.category === '__none'}
              to={href(filter, { category: '__none', page: undefined, tx: undefined })}
            >
              Unclassified
            </Chip>
            {data.byCategory
              .filter((c) => c.name !== 'Unclassified')
              .map((c) => (
                <Chip
                  key={c.name}
                  active={filter.category === c.name}
                  to={href(filter, { category: c.name, page: undefined, tx: undefined })}
                >
                  {c.name}
                </Chip>
              ))}
          </div>
        </div>
        <div role="grid" aria-label="Transactions" className="text-sm">
          <div
            role="row"
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_9rem_8rem_7rem] gap-3 border-b border-rule bg-paper px-3 py-1.5 text-xs text-muted"
          >
            <span>Date</span>
            <span>Payee · description</span>
            <span>Category</span>
            <span>Account</span>
            <span className="text-right">Amount</span>
          </div>
          {data.transactions.map((t) => {
            const active = t.id === selected?.id;
            return (
              <Link
                key={t.id}
                role="row"
                href={href(filter, { tx: t.id })}
                scroll={false}
                aria-selected={active}
                className={cx(
                  'grid h-8 grid-cols-[4.5rem_minmax(0,1fr)_9rem_8rem_7rem] items-center gap-3 border-b border-rule/60 px-3',
                  active
                    ? 'bg-accent-tint shadow-[inset_2px_0_0] shadow-accent-ink'
                    : 'hover:bg-sunken',
                )}
              >
                <span className="text-muted tabular-nums">{shortDate(t.date)}</span>
                <span className="truncate">
                  <span className="font-medium text-ink">{t.payee ?? '—'}</span>{' '}
                  <span className="text-muted">{t.description}</span>
                </span>
                <span className={cx('truncate', t.category ? 'text-ink-soft' : 'text-warning')}>
                  {t.category ?? 'Unclassified'}
                </span>
                <span className="truncate text-muted">{t.account}</span>
                <span
                  className={cx(
                    'text-right tabular-nums',
                    t.amount > 0 ? 'text-positive' : 'text-ink',
                  )}
                >
                  {money(t.amount)}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
          <span>
            j / k to move · page {data.page} of {data.pageCount}
          </span>
          <span className="flex gap-3">
            {data.page > 1 && (
              <Link
                href={href(filter, { page: data.page - 1, tx: undefined })}
                className="text-ink hover:underline"
              >
                ← Prev
              </Link>
            )}
            {data.page < data.pageCount && (
              <Link
                href={href(filter, { page: data.page + 1, tx: undefined })}
                className="text-ink hover:underline"
              >
                Next →
              </Link>
            )}
          </span>
        </div>
      </section>

      {selected && (
        <aside
          aria-label="Inspector"
          className="sticky top-16 self-start rounded-lg border border-rule bg-surface p-4"
        >
          <p className="text-xs text-muted">
            {longDate(selected.date)} · {selected.account}
          </p>
          <p
            className={cx(
              'mt-2 font-display text-4xl tracking-tight tabular-nums',
              selected.amount > 0 ? 'text-positive' : 'text-ink',
            )}
          >
            {money(selected.amount)}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{selected.description}</p>
          <Divider />
          <dl className="grid grid-cols-[6rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted">Payee</dt>
            <dd className="font-medium text-ink">
              {selected.payee ?? <span className="text-faint">None</span>}
            </dd>
            <dt className="text-muted">Category</dt>
            <dd>
              {selected.category ? (
                <Badge variant="neutral">
                  {selected.group} / {selected.category}
                </Badge>
              ) : (
                <Badge variant="warning">Unclassified</Badge>
              )}
            </dd>
            <dt className="text-muted">Account</dt>
            <dd className="text-ink">{selected.account}</dd>
          </dl>
          <Divider />
          <div className="flex gap-2">
            <Link
              href={`/transactions/${selected.id}`}
              className="flex-1 rounded-md bg-ink px-3 py-2 text-center text-sm font-medium text-paper hover:bg-ink-hover"
            >
              Classify
            </Link>
            <Link
              href={`/transactions/${selected.id}`}
              className="rounded-md border border-rule-strong px-3 py-2 text-sm font-medium text-ink hover:bg-sunken"
            >
              Split
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
}

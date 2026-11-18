'use client';
/**
 * PROTOTYPE (Tremor redesign) Transactions A, "Sidebar workspace": a filter bar across the top,
 * three KPI cards for the filtered set, then one full-width Tremor Table with Category badges
 * and numbered pagination. The conventional SaaS list. Throwaway.
 */
import Link from 'next/link';
import { RiArrowLeftSLine, RiArrowRightSLine, RiDownloadLine } from '@remixicon/react';
import { Badge } from '@/components/tremor-prototype/Badge';
import { Button } from '@/components/tremor-prototype/Button';
import { Card } from '@/components/tremor-prototype/Card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from '@/components/tremor-prototype/Table';
import { money, shortDate } from '@/components/tremor-prototype/format';
import type { ProtoTransactionFilter, ProtoTransactionPage } from '@/server/prototype-tremor-data';

const FIELD =
  'rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm text-ink shadow-xs';

function pageHref(filter: ProtoTransactionFilter, page: number) {
  const p = new URLSearchParams();
  if (filter.q) p.set('q', filter.q);
  if (filter.account) p.set('account', filter.account);
  if (filter.category) p.set('category', filter.category);
  p.set('page', String(page));
  return `?${p}`;
}

export function TransactionsA({
  data,
  filter,
}: {
  data: ProtoTransactionPage;
  filter: ProtoTransactionFilter;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">Transactions</h1>
          <p className="mt-1 text-sm text-muted">Every booking across your Accounts.</p>
        </div>
        <Button variant="secondary" asChild>
          <a href="/api/transactions/export">
            <RiDownloadLine className="-ml-1 mr-1.5 size-4" /> Export CSV
          </a>
        </Button>
      </div>

      <form className="flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface p-3">
        <input
          name="q"
          defaultValue={filter.q}
          placeholder="Search description or payee"
          className={`${FIELD} min-w-64 flex-1`}
        />
        <select name="account" defaultValue={filter.account ?? ''} className={FIELD}>
          <option value="">All Accounts</option>
          {data.accounts.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select name="category" defaultValue={filter.category ?? ''} className={FIELD}>
          <option value="">All Categories</option>
          <option value="__none">Unclassified</option>
          {data.categoryNames.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button type="submit">Apply</Button>
        {(filter.q || filter.account || filter.category) && (
          <Link href="?" className="text-sm text-ink-soft hover:underline">
            Clear
          </Link>
        )}
      </form>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Card>
          <dt className="text-sm text-muted">Transactions</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-ink">{data.total}</dd>
        </Card>
        <Card>
          <dt className="text-sm text-muted">Money in</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-positive">
            {money(data.inflow)}
          </dd>
        </Card>
        <Card>
          <dt className="text-sm text-muted">Money out</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums text-ink">
            {money(-data.outflow)}
          </dd>
        </Card>
      </dl>

      <Card className="overflow-hidden p-0">
        <TableRoot>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="pl-6">Date</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Payee</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell className="pr-6 text-right">Amount</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.transactions.map((t) => (
                <TableRow key={t.id} className="hover:bg-paper">
                  <TableCell className="pl-6 text-muted">{shortDate(t.date)}</TableCell>
                  <TableCell className="max-w-72 truncate font-medium text-ink">
                    <Link href={`/transactions/${t.id}`} className="hover:underline">
                      {t.description}
                    </Link>
                  </TableCell>
                  <TableCell>{t.payee ?? <span className="text-faint">None</span>}</TableCell>
                  <TableCell>
                    {t.category ? (
                      <Badge variant={t.groupType === 'income' ? 'success' : 'neutral'}>
                        {t.category}
                      </Badge>
                    ) : (
                      <Badge variant="warning">Unclassified</Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.account}</TableCell>
                  <TableCell
                    className={`pr-6 text-right font-medium tabular-nums ${t.amount > 0 ? 'text-positive' : 'text-ink'}`}
                  >
                    {money(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
        <div className="flex items-center justify-between border-t border-rule px-6 py-3 text-sm text-muted">
          <span>
            Page {data.page} of {data.pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" asChild disabled={data.page <= 1}>
              <Link href={pageHref(filter, Math.max(1, data.page - 1))} aria-label="Previous page">
                <RiArrowLeftSLine className="size-4" />
              </Link>
            </Button>
            <Button variant="secondary" asChild disabled={data.page >= data.pageCount}>
              <Link
                href={pageHref(filter, Math.min(data.pageCount, data.page + 1))}
                aria-label="Next page"
              >
                <RiArrowRightSLine className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

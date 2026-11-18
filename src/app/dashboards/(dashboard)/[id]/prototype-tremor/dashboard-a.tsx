'use client';
/**
 * PROTOTYPE (Tremor redesign) Dashboard A, "Sidebar workspace": the classic Tremor dashboard.
 * A KPI row of cards (each with its delta badge and a spark), then a two-thirds / one-third
 * grid of charts and lists, then the Accounts as a table. Everything is a card. Throwaway.
 */
import Link from 'next/link';
import { AreaChart } from '@/components/tremor-prototype/AreaChart';
import { Badge } from '@/components/tremor-prototype/Badge';
import { BarChart } from '@/components/tremor-prototype/BarChart';
import { BarList } from '@/components/tremor-prototype/BarList';
import { Card } from '@/components/tremor-prototype/Card';
import { ProgressBar } from '@/components/tremor-prototype/ProgressBar';
import { ProgressCircle } from '@/components/tremor-prototype/ProgressCircle';
import { SparkAreaChart, SparkLineChart } from '@/components/tremor-prototype/SparkChart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from '@/components/tremor-prototype/Table';
import {
  change,
  compactMoney,
  money,
  money0,
  pct,
  shortDate,
} from '@/components/tremor-prototype/format';
import type { ProtoDashboard } from '@/server/prototype-tremor-data';

function Delta({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const good = inverse ? value <= 0 : value >= 0;
  return <Badge variant={good ? 'success' : 'error'}>{pct(value)}</Badge>;
}

export function DashboardA({ data, name }: { data: ProtoDashboard; name: string }) {
  const m = data.months;
  const now = m.at(-1)!;
  const prev = m.at(-2)!;
  const yearAgo = m.at(-13)!;
  const last12 = m.slice(-12);
  const avgExpense = last12.reduce((s, x) => s + x.expense, 0) / 12;
  const savingsRate = prev.income ? (prev.income - prev.expense) / prev.income : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">{name}</h1>
          <p className="mt-1 text-sm text-muted">
            Where you stand, where it went, and what changed this month.
          </p>
        </div>
        <Link
          href="?variant=current"
          className="text-sm text-ink-soft underline-offset-4 hover:underline"
        >
          Edit Dashboard
        </Link>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <dt className="flex items-center justify-between text-sm text-muted">
            Net worth <Delta value={change(now.netWorth, yearAgo.netWorth)} />
          </dt>
          <dd className="mt-2 font-display text-3xl tracking-tight tabular-nums text-ink">
            {money0(now.netWorth)}
          </dd>
          <SparkAreaChart
            data={m}
            index="label"
            categories={['netWorth']}
            colors={['navy']}
            className="mt-4 h-10 w-full"
            autoMinValue
          />
          <p className="mt-2 text-xs text-muted">vs. {yearAgo.label}</p>
        </Card>
        <Card>
          <dt className="flex items-center justify-between text-sm text-muted">
            Income, {prev.label} <Delta value={change(prev.income, m.at(-3)!.income)} />
          </dt>
          <dd className="mt-2 font-display text-3xl tracking-tight tabular-nums text-ink">
            {money0(prev.income)}
          </dd>
          <SparkLineChart
            data={last12}
            index="label"
            categories={['income']}
            colors={['positive']}
            className="mt-4 h-10 w-full"
          />
          <p className="mt-2 text-xs text-muted">Last full month</p>
        </Card>
        <Card>
          <dt className="flex items-center justify-between text-sm text-muted">
            Spending, {now.label} <Delta value={change(now.expense, avgExpense)} inverse />
          </dt>
          <dd className="mt-2 font-display text-3xl tracking-tight tabular-nums text-ink">
            {money0(now.expense)}
          </dd>
          <ProgressBar
            value={Math.min(100, (now.expense / avgExpense) * 100)}
            className="mt-6"
            showAnimation
          />
          <p className="mt-3 text-xs text-muted">
            {Math.round((now.expense / avgExpense) * 100)}% of your monthly average (
            {money0(avgExpense)})
          </p>
        </Card>
        <Card className="flex items-center gap-5">
          <ProgressCircle value={Math.max(0, savingsRate * 100)} radius={34} strokeWidth={7}>
            <span className="text-sm font-medium tabular-nums text-ink">
              {Math.round(savingsRate * 100)}%
            </span>
          </ProgressCircle>
          <div>
            <dt className="text-sm text-muted">Savings rate</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums text-ink">
              {money0(prev.income - prev.expense)}
            </dd>
            <p className="text-xs text-muted">kept in {prev.label}</p>
          </div>
        </Card>
      </dl>

      {data.unclassifiedCount > 0 && (
        <Card className="flex items-center justify-between gap-4 border-warning-rule bg-warning-tint py-3">
          <p className="text-sm text-warning">
            {data.unclassifiedCount} Transactions are unclassified, so the figures below leave them
            out.
          </p>
          <Link href="/unclassified" className="text-sm font-medium text-warning underline">
            Review
          </Link>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-medium text-ink">Net worth by account kind</h2>
          <p className="text-sm text-muted">Month-end balances, last 25 months</p>
          <AreaChart
            className="mt-6 h-72"
            data={m}
            index="label"
            categories={['current', 'savings', 'pillar']}
            colors={['navy', 'glow', 'mist']}
            type="stacked"
            valueFormatter={compactMoney}
            yAxisWidth={72}
            fill="solid"
          />
        </Card>
        <Card>
          <h2 className="font-medium text-ink">Where it went</h2>
          <p className="text-sm text-muted">Expense categories, last 12 months</p>
          <div className="mt-4 flex justify-between text-xs font-medium text-muted">
            <span>Category</span>
            <span>CHF</span>
          </div>
          <BarList
            className="mt-2"
            data={data.categories.slice(0, 8).map((c) => ({
              name: c.name,
              value: c.year,
              href: `/transactions?category=${encodeURIComponent(c.name)}`,
            }))}
            valueFormatter={money0}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-medium text-ink">Income and spending</h2>
          <p className="text-sm text-muted">Last 12 months</p>
          <BarChart
            className="mt-6 h-64"
            data={last12}
            index="label"
            categories={['income', 'expense']}
            colors={['navy', 'amber']}
            valueFormatter={compactMoney}
            yAxisWidth={64}
          />
        </Card>
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-medium text-ink">Recent activity</h2>
            <Link href="/transactions" className="text-sm text-accent-ink hover:underline">
              All Transactions
            </Link>
          </div>
          <TableRoot className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="pl-6">Date</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>Category</TableHeaderCell>
                  <TableHeaderCell className="pr-6 text-right">Amount</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.recent.slice(0, 7).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-6 text-muted">{shortDate(t.date)}</TableCell>
                    <TableCell className="font-medium text-ink">
                      {t.payee ?? t.description}
                    </TableCell>
                    <TableCell>
                      {t.category ? (
                        <Badge variant="neutral">{t.category}</Badge>
                      ) : (
                        <Badge variant="warning">Unclassified</Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={`pr-6 text-right tabular-nums ${t.amount > 0 ? 'text-positive' : 'text-ink'}`}
                    >
                      {money(t.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <h2 className="px-6 pt-6 font-medium text-ink">Accounts</h2>
        <TableRoot className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="pl-6">Account</TableHeaderCell>
                <TableHeaderCell>Bank</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
                <TableHeaderCell>Trend (25 months)</TableHeaderCell>
                <TableHeaderCell className="pr-6 text-right">Balance</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-6 font-medium text-ink">
                    <Link href={`/accounts/${a.id}`} className="hover:underline">
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>{a.bank}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">{a.kind}</Badge>
                  </TableCell>
                  <TableCell>
                    <SparkLineChart
                      data={a.series.map((v, i) => ({ i, v }))}
                      index="i"
                      categories={['v']}
                      colors={['navy']}
                      className="h-8 w-40"
                      autoMinValue
                    />
                  </TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums text-ink">
                    {money(a.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      </Card>
    </div>
  );
}

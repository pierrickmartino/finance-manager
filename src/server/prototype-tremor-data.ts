import 'server-only';
/**
 * PROTOTYPE (Tremor redesign), throwaway: read-only figures for the ?variant= prototypes of the
 * Dashboard and Transactions pages. Plain SQL, CHF Accounts only (no FX), no Widgets. Not for
 * production: the real pages go through the reporting and transactions services.
 */
import type { Queryable } from '@/server/db/client';

export interface ProtoAccount {
  id: string;
  name: string;
  kind: string;
  bank: string;
  balance: number;
  /** Month-end balances, oldest first, one per month of `ProtoDashboard.months`. */
  series: number[];
}

export interface ProtoMonth {
  month: string; // YYYY-MM
  label: string; // "Nov 25"
  income: number;
  expense: number;
  netWorth: number;
  current: number;
  savings: number;
  pillar: number;
  loan: number;
}

export interface ProtoCategory {
  id: string;
  name: string;
  group: string;
  thisMonth: number;
  lastMonth: number;
  year: number;
  /** Last 12 months, oldest first. */
  series: number[];
}

export interface ProtoTransaction {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  category: string | null;
  group: string | null;
  groupType: string | null;
  account: string;
  amount: number;
}

export interface ProtoDashboard {
  months: ProtoMonth[];
  accounts: ProtoAccount[];
  categories: ProtoCategory[];
  recent: ProtoTransaction[];
  unclassifiedCount: number;
  /** Expense per day for the last 91 days, oldest first. */
  daily: { date: string; expense: number }[];
}

const MONTHS = 25;

const TX_SELECT = `
  SELECT t.id, to_char(t.booking_date, 'YYYY-MM-DD') AS date,
         coalesce(t.raw_description, '') AS description, p.name AS payee, c.name AS category,
         g.name AS "group", g.type AS "groupType", a.name AS account,
         t.amount_minor::float / 100 AS amount
  FROM "transaction" t
  JOIN account a ON a.id = t.account_id
  LEFT JOIN payee p ON p.id = t.payee_id
  LEFT JOIN category c ON c.id = t.category_id
  LEFT JOIN category_group g ON g.id = c.group_id`;

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

export async function loadProtoDashboard(db: Queryable): Promise<ProtoDashboard> {
  const monthRows = await db.query<{ month: string }>(
    `SELECT to_char(m, 'YYYY-MM') AS month
     FROM generate_series(date_trunc('month', current_date) - interval '${MONTHS - 1} months',
                          date_trunc('month', current_date), interval '1 month') m`,
  );
  const months = monthRows.rows.map((r) => r.month);

  const accounts = await db.query<{
    id: string;
    name: string;
    kind: string;
    bank: string;
    opening: number;
  }>(
    `SELECT a.id, a.name, a.kind, b.name AS bank, a.opening_balance_minor::float / 100 AS opening
     FROM account a JOIN bank b ON b.id = a.bank_id WHERE a.archived_at IS NULL ORDER BY a.name`,
  );
  const flows = await db.query<{ account_id: string; month: string; sum: number }>(
    `SELECT account_id, to_char(booking_date, 'YYYY-MM') AS month,
            sum(amount_minor)::float / 100 AS sum
     FROM "transaction" GROUP BY 1, 2`,
  );
  const flowOf = new Map(flows.rows.map((r) => [`${r.account_id}|${r.month}`, r.sum]));
  const before = new Map<string, number>();
  for (const r of flows.rows) {
    if (r.month < months[0]!) before.set(r.account_id, (before.get(r.account_id) ?? 0) + r.sum);
  }
  const protoAccounts: ProtoAccount[] = accounts.rows.map((a) => {
    let running = a.opening + (before.get(a.id) ?? 0);
    const series = months.map((m) => (running += flowOf.get(`${a.id}|${m}`) ?? 0));
    return { ...a, balance: series.at(-1) ?? running, series };
  });

  const ie = await db.query<{ month: string; income: number; expense: number }>(
    `SELECT to_char(t.booking_date, 'YYYY-MM') AS month,
            coalesce(sum(t.amount_minor) FILTER (WHERE g.type = 'income'), 0)::float / 100 AS income,
            coalesce(-sum(t.amount_minor) FILTER (WHERE g.type = 'expense'), 0)::float / 100 AS expense
     FROM "transaction" t JOIN category c ON c.id = t.category_id
     JOIN category_group g ON g.id = c.group_id GROUP BY 1`,
  );
  const ieOf = new Map(ie.rows.map((r) => [r.month, r]));
  const byKind = (kind: string, i: number) =>
    protoAccounts.filter((a) => a.kind === kind).reduce((s, a) => s + a.series[i]!, 0);
  const protoMonths: ProtoMonth[] = months.map((month, i) => ({
    month,
    label: monthLabel(month),
    income: ieOf.get(month)?.income ?? 0,
    expense: ieOf.get(month)?.expense ?? 0,
    netWorth: protoAccounts.reduce((s, a) => s + a.series[i]!, 0),
    current: byKind('current', i),
    savings: byKind('savings', i),
    pillar: byKind('3a', i),
    loan: byKind('loan', i),
  }));

  const last12 = months.slice(-12);
  const cat = await db.query<{
    id: string;
    name: string;
    group: string;
    month: string;
    sum: number;
  }>(
    `SELECT c.id, c.name, g.name AS "group", to_char(t.booking_date, 'YYYY-MM') AS month,
            -sum(t.amount_minor)::float / 100 AS sum
     FROM "transaction" t JOIN category c ON c.id = t.category_id
     JOIN category_group g ON g.id = c.group_id
     WHERE g.type = 'expense' AND t.booking_date >= $1::date
     GROUP BY 1, 2, 3, 4`,
    [`${last12[0]}-01`],
  );
  const catMap = new Map<string, ProtoCategory>();
  for (const r of cat.rows) {
    const c = catMap.get(r.id) ?? {
      id: r.id,
      name: r.name,
      group: r.group,
      thisMonth: 0,
      lastMonth: 0,
      year: 0,
      series: last12.map(() => 0),
    };
    const i = last12.indexOf(r.month);
    c.series[i] = r.sum;
    c.year += r.sum;
    if (i === 11) c.thisMonth = r.sum;
    if (i === 10) c.lastMonth = r.sum;
    catMap.set(r.id, c);
  }
  const categories = [...catMap.values()].sort((a, b) => b.year - a.year);

  const recent = await db.query<ProtoTransaction>(
    `${TX_SELECT} ORDER BY t.booking_date DESC, t.entry_order DESC LIMIT 12`,
  );
  const unclassified = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "transaction" WHERE category_id IS NULL AND transfer_id IS NULL`,
  );
  const daily = await db.query<{ date: string; expense: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS date,
            coalesce((SELECT -sum(t.amount_minor) FROM "transaction" t
                      JOIN category c ON c.id = t.category_id
                      JOIN category_group g ON g.id = c.group_id
                      WHERE g.type = 'expense' AND t.booking_date = d::date), 0)::float / 100 AS expense
     FROM generate_series(current_date - 90, current_date, interval '1 day') d`,
  );

  return {
    months: protoMonths,
    accounts: protoAccounts,
    categories,
    recent: recent.rows,
    unclassifiedCount: unclassified.rows[0]?.n ?? 0,
    daily: daily.rows,
  };
}

export interface ProtoTransactionFilter {
  q?: string;
  account?: string;
  category?: string;
  page?: number;
}

export interface ProtoTransactionPage {
  transactions: ProtoTransaction[];
  total: number;
  inflow: number;
  outflow: number;
  byCategory: { name: string; value: number }[];
  accounts: string[];
  categoryNames: string[];
  page: number;
  pageCount: number;
}

const PAGE_SIZE = 40;

export async function loadProtoTransactions(
  db: Queryable,
  filter: ProtoTransactionFilter,
): Promise<ProtoTransactionPage> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where.push(`(t.raw_description ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  if (filter.account) {
    params.push(filter.account);
    where.push(`a.name = $${params.length}`);
  }
  if (filter.category === '__none') where.push('t.category_id IS NULL');
  else if (filter.category) {
    params.push(filter.category);
    where.push(`c.name = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, filter.page ?? 1);

  const rows = await db.query<ProtoTransaction>(
    `${TX_SELECT} ${clause} ORDER BY t.booking_date DESC, t.entry_order DESC
     LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params,
  );
  const sums = await db.query<{ total: number; inflow: number; outflow: number }>(
    `SELECT count(*)::int AS total,
            coalesce(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0)::float / 100 AS inflow,
            coalesce(-sum(t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0)::float / 100 AS outflow
     FROM "transaction" t JOIN account a ON a.id = t.account_id
     LEFT JOIN payee p ON p.id = t.payee_id LEFT JOIN category c ON c.id = t.category_id ${clause}`,
    params,
  );
  const byCategory = await db.query<{ name: string; value: number }>(
    `SELECT coalesce(c.name, 'Unclassified') AS name, -sum(t.amount_minor)::float / 100 AS value
     FROM "transaction" t JOIN account a ON a.id = t.account_id
     LEFT JOIN payee p ON p.id = t.payee_id LEFT JOIN category c ON c.id = t.category_id
     ${clause}${clause ? ' AND' : ' WHERE'} t.amount_minor < 0
     GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    params,
  );
  const accounts = await db.query<{ name: string }>(
    'SELECT name FROM account WHERE archived_at IS NULL ORDER BY name',
  );
  const categoryNames = await db.query<{ name: string }>(
    `SELECT DISTINCT c.name FROM category c JOIN "transaction" t ON t.category_id = c.id ORDER BY 1`,
  );
  const s = sums.rows[0]!;
  return {
    transactions: rows.rows,
    total: s.total,
    inflow: s.inflow,
    outflow: s.outflow,
    byCategory: byCategory.rows,
    accounts: accounts.rows.map((r) => r.name),
    categoryNames: categoryNames.rows.map((r) => r.name),
    page,
    pageCount: Math.max(1, Math.ceil(s.total / PAGE_SIZE)),
  };
}

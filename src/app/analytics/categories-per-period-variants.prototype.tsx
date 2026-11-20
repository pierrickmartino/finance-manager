'use client';

/**
 * PROTOTYPE ONLY — throwaway. Three takes on "Categories per period" that make a Category
 * group and its Categories read as a hierarchy. See ./categories-per-period.prototype.tsx.
 * Rows stay in the service's order (type, then group, then its Categories) instead of the
 * heatmap's "largest total first", which is what tears Income › Salary away from Income today.
 */

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { GHOST_BUTTON_CLASS, TILE_CLASS } from '@/components/surface';
import { compactValue, HEAT_LEVELS, heatLevel } from '@/lib/reporting/heatmap';
import type { ChartSource } from '@/lib/reporting/chart-data';
import type { AnalyticsCard } from '@/server/services/analytics';

export interface ProtoGroup {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'capital';
  categoryIds: string[];
}

// The tree --------------------------------------------------------------------------------------

interface Line {
  r: number;
  name: string;
  cells: (number | null)[];
  hrefs: string[];
  total: number | null;
  totalHref: string;
}
interface GroupNode extends Line {
  id: string;
  children: Line[];
}
interface TypeNode {
  type: ProtoGroup['type'];
  groups: GroupNode[];
  total: number | null;
}

const TYPE_LABEL = { income: 'Income', expense: 'Expense', capital: 'Capital' } as const;

function line(data: ChartSource, r: number, name: string): Line {
  return {
    r,
    name,
    cells: data.columns.map((_, c) => data.cells[r]?.[c] ?? null),
    hrefs: data.hrefs.cells[r]!,
    total: data.rowTotals[r] ?? null,
    totalHref: data.hrefs.rowTotals[r]!,
  };
}

function buildTree(data: ChartSource, groups: ProtoGroup[]): TypeNode[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const nodes: (GroupNode & { type: ProtoGroup['type'] })[] = [];
  data.rows.forEach((row, r) => {
    const key = row.key ?? '';
    if (key.startsWith('group:')) {
      const group = byId.get(key.slice('group:'.length));
      nodes.push({
        ...line(data, r, row.label),
        id: key,
        type: group?.type ?? 'expense',
        children: [],
      });
    } else {
      const name = row.label.split(' › ').slice(1).join(' › ') || row.label;
      nodes.at(-1)?.children.push(line(data, r, name));
    }
  });
  const types = (['income', 'expense', 'capital'] as const)
    .map((type) => {
      const list = nodes.filter((n) => n.type === type);
      const totals = list.map((g) => g.total).filter((v): v is number => v !== null);
      return {
        type,
        groups: list,
        total: totals.length ? totals.reduce((a, b) => a + b, 0) : null,
      };
    })
    .filter((t) => t.groups.length > 0);
  return types;
}

const largestOf = (lines: Line[]) =>
  Math.max(0, ...lines.flatMap((l) => l.cells.map((v) => Math.abs(v ?? 0))));

const shade = (mix: number) =>
  `color-mix(in srgb, var(--color-hero-mid) ${mix}%, var(--color-surface))`;

const MONTH = /^([A-Z][a-z]{2}) \d{4}$/;
const shortLabel = (label: string) => MONTH.exec(label)?.[1] ?? label;

function useMoney(data: ChartSource) {
  const fmt = useFormatter();
  const values = data.cells.flat().filter((v): v is number => v !== null);
  const isSigned = values.some((v) => v > 0) && values.some((v) => v < 0);
  return {
    full: (v: number) => fmt.amount(v, { currency: 'CHF' }),
    whole: (v: number) => fmt.amount(v, { currency: 'CHF', isWhole: true }),
    compact: (v: number) => compactValue(v, data.measure, isSigned),
  };
}

function Shell({ card, children }: { card: AnalyticsCard; children: ReactNode }) {
  return (
    <section className={`${TILE_CLASS} flex min-w-0 flex-col gap-4`}>
      <h2 className="font-medium">{card.name}</h2>
      {children}
    </section>
  );
}

function HeatCell({
  value,
  href,
  largest,
  label,
  isPartial,
  money,
}: {
  value: number | null;
  href: string;
  largest: number;
  label: string;
  isPartial: boolean;
  money: ReturnType<typeof useMoney>;
}) {
  if (value === null) return <td className="rounded-md bg-sunken/60" />;
  const level = HEAT_LEVELS[heatLevel(largest === 0 ? 0 : Math.abs(value) / largest)]!;
  return (
    <td className="p-0">
      <Link
        href={href}
        aria-label={`${label}: ${money.full(value)}`}
        title={money.full(value)}
        className={`block min-w-12 rounded-md px-1 py-1.5 text-center tabular-nums hover:ring-2 hover:ring-accent ${level.isDark ? 'text-on-hero' : 'text-ink'} ${isPartial ? 'outline-2 -outline-offset-2 outline-hero-deep outline-dashed' : ''}`}
        style={{ backgroundColor: shade(level.mix) }}
      >
        {money.compact(value)}
      </Link>
    </td>
  );
}

// Variant A: indented tree heatmap ---------------------------------------------------------------

/**
 * Same heatmap, but a tree: a type heading, each group as a sunken band of plain bold
 * subtotals (not shaded, so it never drowns its children), its Categories indented under a
 * tree line and shaded against the largest Category cell of their type.
 */
function VariantA({ card, tree }: { card: AnalyticsCard; tree: TypeNode[] }) {
  const data = card.data!;
  const money = useMoney(data);
  const cols = data.columns;
  return (
    <Shell card={card}>
      <div className="min-h-0 overflow-x-auto">
        <table className="w-full border-separate border-spacing-x-1 border-spacing-y-0.5 text-xs">
          <thead>
            <tr>
              <td />
              {cols.map((c) => (
                <th key={c.key} className="px-1 text-center font-normal text-muted">
                  {shortLabel(c.label)}
                  {c.isPartial && '*'}
                </th>
              ))}
              <th className="px-1 text-right font-normal text-muted">Total</th>
            </tr>
          </thead>
          {tree.map((type) => {
            const largest = largestOf(type.groups.flatMap((g) => g.children));
            return (
              <tbody key={type.type}>
                <tr>
                  <th
                    colSpan={cols.length + 2}
                    className="border-b border-rule pt-4 pb-1 text-left text-xs font-medium text-muted"
                  >
                    {TYPE_LABEL[type.type]}
                    {type.total !== null && (
                      <span className="ml-2 tabular-nums">{money.whole(type.total)}</span>
                    )}
                  </th>
                </tr>
                {type.groups.map((group) => (
                  <GroupRowsA
                    key={group.id}
                    group={group}
                    data={data}
                    largest={largest}
                    money={money}
                  />
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className="inline-block h-3 w-6 rounded-sm bg-sunken ring-1 ring-rule" /> Group
        subtotal
        <span className="ml-3 flex gap-0.5">
          {HEAT_LEVELS.map((l) => (
            <span
              key={l.mix}
              className="h-2 w-3 rounded-sm"
              style={{ backgroundColor: shade(l.mix) }}
            />
          ))}
        </span>
        Category, darker is larger within its type
      </p>
    </Shell>
  );
}

function GroupRowsA({
  group,
  data,
  largest,
  money,
}: {
  group: GroupNode;
  data: ChartSource;
  largest: number;
  money: ReturnType<typeof useMoney>;
}) {
  return (
    <>
      <tr className="bg-sunken">
        <th scope="row" className="rounded-l-md py-1.5 pr-2 pl-2 text-left text-sm font-semibold">
          {group.name}
        </th>
        {group.cells.map((v, c) => (
          <td key={c} className="px-1 py-1.5 text-center font-semibold tabular-nums">
            {v === null ? (
              <span className="text-faint">—</span>
            ) : (
              <Link href={group.hrefs[c]!} className="hover:underline">
                {money.compact(v)}
              </Link>
            )}
          </td>
        ))}
        <td className="rounded-r-md px-2 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
          {group.total !== null && (
            <Link href={group.totalHref} className="hover:underline">
              {money.full(group.total)}
            </Link>
          )}
        </td>
      </tr>
      {group.children.map((child, i) => (
        <tr key={child.r}>
          <th scope="row" className="max-w-48 text-left font-normal">
            <span className="flex items-center">
              <span
                aria-hidden
                className={`ml-3 w-3 shrink-0 self-stretch border-l border-rule-strong ${i === group.children.length - 1 ? 'h-1/2 self-start' : ''}`}
              >
                <span className="mt-[0.9em] block border-t border-rule-strong" />
              </span>
              <span
                className="truncate py-1 pl-1 text-ink-soft"
                title={`${group.name} › ${child.name}`}
              >
                {child.name}
              </span>
            </span>
          </th>
          {child.cells.map((v, c) => (
            <HeatCell
              key={c}
              value={v}
              href={child.hrefs[c]!}
              largest={largest}
              label={`${group.name} › ${child.name}, ${data.columns[c]!.label}`}
              isPartial={data.columns[c]!.isPartial}
              money={money}
            />
          ))}
          <td className="px-2 text-right whitespace-nowrap text-ink-soft tabular-nums">
            {child.total !== null && (
              <Link href={child.totalHref} className="hover:underline">
                {money.full(child.total)}
              </Link>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

// Variant B: collapsible groups ------------------------------------------------------------------

/**
 * Groups first: one heat row per group (shaded within its type), collapsed by default. Open a
 * group and its Categories slide in beneath it on a nested panel with a navy rail, each shaded
 * against its own group and carrying its share of the group.
 */
function VariantB({ card, tree }: { card: AnalyticsCard; tree: TypeNode[] }) {
  const data = card.data!;
  const money = useMoney(data);
  const cols = data.columns;
  const allIds = tree.flatMap((t) => t.groups.map((g) => g.id));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const isAllOpen = open.size === allIds.length;
  return (
    <Shell card={card}>
      <div className="-mt-2 flex justify-end">
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          onClick={() => setOpen(isAllOpen ? new Set() : new Set(allIds))}
        >
          {isAllOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="min-h-0 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <td />
              {cols.map((c) => (
                <th key={c.key} className="px-1 text-center font-normal text-muted">
                  {shortLabel(c.label)}
                  {c.isPartial && '*'}
                </th>
              ))}
              <th className="px-1 text-right font-normal text-muted">Total</th>
            </tr>
          </thead>
          {tree.map((type) => {
            const groupLargest = largestOf(type.groups);
            return (
              <tbody key={type.type}>
                <tr>
                  <th
                    colSpan={cols.length + 2}
                    className="pt-3 text-left text-xs font-medium text-muted"
                  >
                    {TYPE_LABEL[type.type]}
                  </th>
                </tr>
                {type.groups.map((group) => {
                  const isOpen = open.has(group.id);
                  const childLargest = largestOf(group.children);
                  return [
                    <tr key={group.id}>
                      <th scope="row" className="max-w-52 text-left">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => toggle(group.id)}
                          className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left hover:bg-sunken"
                        >
                          <span
                            aria-hidden
                            className={`inline-block w-3 text-muted motion-safe:transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          >
                            ▸
                          </span>
                          <span className="truncate text-sm font-semibold">{group.name}</span>
                          <span className="ml-auto shrink-0 rounded-md bg-sunken px-1.5 text-[10px] font-normal text-muted">
                            {group.children.length}
                          </span>
                        </button>
                      </th>
                      {group.cells.map((v, c) => (
                        <HeatCell
                          key={c}
                          value={v}
                          href={group.hrefs[c]!}
                          largest={groupLargest}
                          label={`${group.name}, ${cols[c]!.label}`}
                          isPartial={cols[c]!.isPartial}
                          money={money}
                        />
                      ))}
                      <td className="pl-2 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
                        {group.total !== null && (
                          <Link href={group.totalHref} className="hover:underline">
                            {money.full(group.total)}
                          </Link>
                        )}
                      </td>
                    </tr>,
                    ...(isOpen
                      ? group.children.map((child, i) => {
                          const share =
                            group.total && child.total ? child.total / group.total : null;
                          const isLast = i === group.children.length - 1;
                          return (
                            <tr key={child.r} className="bg-sunken/70">
                              <th
                                scope="row"
                                className={`max-w-52 border-l-4 border-hero-mid pl-6 text-left font-normal ${isLast ? 'rounded-bl-md' : ''}`}
                              >
                                <span className="block truncate py-1 text-ink-soft">
                                  {child.name}
                                </span>
                              </th>
                              {child.cells.map((v, c) => (
                                <HeatCell
                                  key={c}
                                  value={v}
                                  href={child.hrefs[c]!}
                                  largest={childLargest}
                                  label={`${group.name} › ${child.name}, ${cols[c]!.label}`}
                                  isPartial={cols[c]!.isPartial}
                                  money={money}
                                />
                              ))}
                              <td
                                className={`pr-1 pl-2 text-right whitespace-nowrap tabular-nums ${isLast ? 'rounded-br-md' : ''}`}
                              >
                                {child.total !== null && (
                                  <Link href={child.totalHref} className="hover:underline">
                                    {money.full(child.total)}
                                  </Link>
                                )}
                                {share !== null && (
                                  <span className="ml-1.5 text-[10px] text-muted">
                                    {Math.round(share * 100)}%
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      : []),
                  ];
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="text-xs text-muted">
        Groups shaded within their type; open a group to see its Categories, shaded within the
        group, with their share of it.
      </p>
    </Shell>
  );
}

// Variant C: group blocks with share bars ----------------------------------------------------------

/**
 * No grid. Each type is a column of group blocks: the group's name and total with a bar per
 * period beside it, then its Categories as a ranked list with a bar for their share of the
 * group and a strip of small squares for their periods.
 */
function VariantC({ card, tree }: { card: AnalyticsCard; tree: TypeNode[] }) {
  const data = card.data!;
  const money = useMoney(data);
  const cols = data.columns;
  return (
    <Shell card={card}>
      <div className="grid gap-6 lg:grid-cols-3">
        {tree.map((type) => (
          <div key={type.type} className="flex min-w-0 flex-col gap-3">
            <div className="flex items-baseline justify-between border-b border-rule pb-1">
              <h3 className="text-sm font-medium text-muted">{TYPE_LABEL[type.type]}</h3>
              {type.total !== null && (
                <span className="font-display text-xl tabular-nums">{money.whole(type.total)}</span>
              )}
            </div>
            {type.groups.map((group) => {
              const peak = largestOf([group]);
              const childLargest = largestOf(group.children);
              const ranked = [...group.children].sort(
                (a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0),
              );
              return (
                <div key={group.id} className="rounded-xl border border-rule p-3">
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{group.name}</p>
                      {group.total !== null && (
                        <Link
                          href={group.totalHref}
                          className="text-sm tabular-nums text-ink-soft hover:underline"
                        >
                          {money.full(group.total)}
                        </Link>
                      )}
                    </div>
                    <div className="flex h-8 items-end gap-0.5" aria-hidden>
                      {group.cells.map((v, c) => (
                        <Link
                          key={c}
                          href={group.hrefs[c]!}
                          title={`${cols[c]!.label}: ${v === null ? '—' : money.full(v)}`}
                          className={`w-2 rounded-sm ${cols[c]!.isPartial ? 'bg-hatch' : 'bg-hero-mid'}`}
                          style={{
                            height: `${peak ? Math.max(4, (Math.abs(v ?? 0) / peak) * 100) : 4}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5 border-t border-rule pt-2">
                    {ranked.map((child) => {
                      const share =
                        group.total && child.total ? Math.abs(child.total / group.total) : 0;
                      return (
                        <li key={child.r} className="text-xs">
                          <div className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-ink-soft">
                              {child.name}
                            </span>
                            {child.total !== null && (
                              <Link href={child.totalHref} className="tabular-nums hover:underline">
                                {money.whole(child.total)}
                              </Link>
                            )}
                            <span className="w-8 text-right text-muted tabular-nums">
                              {Math.round(share * 100)}%
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="h-1.5 flex-1 rounded-full bg-sunken">
                              <span
                                className="block h-full rounded-full bg-hero-mid"
                                style={{ width: `${Math.min(100, share * 100)}%` }}
                              />
                            </span>
                            <span className="flex gap-px" aria-hidden>
                              {child.cells.map((v, c) => (
                                <span
                                  key={c}
                                  title={`${cols[c]!.label}: ${v === null ? '—' : money.full(v)}`}
                                  className="h-2 w-2 rounded-[2px]"
                                  style={{
                                    backgroundColor:
                                      v === null
                                        ? 'var(--color-sunken)'
                                        : shade(
                                            HEAT_LEVELS[
                                              heatLevel(
                                                childLargest ? Math.abs(v) / childLargest : 0,
                                              )
                                            ]!.mix,
                                          ),
                                  }}
                                />
                              ))}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Shell>
  );
}

// Switch ----------------------------------------------------------------------------------------

export function CategoryVariants({
  variant,
  card,
  groups,
}: {
  variant: string;
  card: AnalyticsCard;
  groups: ProtoGroup[];
}) {
  if (card.isEmpty || !card.data) {
    return <p className="text-muted">Nothing to show yet: no classified Transactions.</p>;
  }
  const tree = buildTree(card.data, groups);
  if (variant === 'B') return <VariantB card={card} tree={tree} />;
  if (variant === 'C') return <VariantC card={card} tree={tree} />;
  return <VariantA card={card} tree={tree} />;
}

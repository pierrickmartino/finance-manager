'use client';

/**
 * PROTOTYPE variant D — "Category › Payee outline": no sidebar. One full-width tree,
 * Category Group › Category › Payee › Rules, with totals on every level and instant filtering.
 * A Rule opens in a slide-over drawer.
 */
import Link from 'next/link';
import { useState } from 'react';
import { FieldError } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import { RuleDetail } from '../rule-detail';
import type { ReorderAction } from '../use-rule-order';
import { filterRules } from '../view';
import { NO_CATEGORY, NO_PAYEE, type PrototypeRule } from './shared';
import { protoHref, useOrdered } from './use-ordered';

interface Props {
  rules: PrototypeRule[];
  ruleId: string | undefined;
  reorder: ReorderAction;
}

interface Node {
  kind: 'Group' | 'Category' | 'Payee';
  key: string;
  label: string;
  rules: PrototypeRule[];
  children: Node[];
}

const sortNodes = (nodes: Node[]) =>
  nodes.sort((a, b) =>
    a.label === NO_CATEGORY || a.label === NO_PAYEE
      ? 1
      : b.label === NO_CATEGORY || b.label === NO_PAYEE
        ? -1
        : a.label.localeCompare(b.label),
  );

/** Category Group › Category › Payee, Rules at the leaves in run order. */
function buildTree(rules: PrototypeRule[]): Node[] {
  const roots = new Map<string, Node>();
  const child = (
    parent: Map<string, Node> | Node,
    key: string,
    label: string,
    kind: Node['kind'],
  ) => {
    const list = parent instanceof Map ? parent : new Map(parent.children.map((n) => [n.key, n]));
    let node = list.get(key);
    if (!node) {
      node = { kind, key, label, rules: [], children: [] };
      if (parent instanceof Map) parent.set(key, node);
      else parent.children.push(node);
    }
    return node;
  };
  for (const rule of rules) {
    const groupLabel = rule.categoryGroup ?? NO_CATEGORY;
    const root = child(roots, groupLabel, groupLabel, 'Group');
    root.rules.push(rule);
    const cat = rule.category
      ? child(root, `${groupLabel}/${rule.category}`, rule.category, 'Category')
      : root;
    if (cat !== root) cat.rules.push(rule);
    const payee = child(cat, `${cat.key}/${rule.payee ?? ''}`, rule.payee ?? NO_PAYEE, 'Payee');
    payee.rules.push(rule);
  }
  const sortDeep = (nodes: Node[]): Node[] =>
    sortNodes(nodes).map((node) => ({ ...node, children: sortDeep(node.children) }));
  return sortDeep([...roots.values()]);
}

const allKeys = (nodes: Node[]): string[] =>
  nodes.flatMap((node) => [node.key, ...allKeys(node.children)]);

export function VariantD({ rules, ruleId, reorder }: Props) {
  const { ruleOrder, ordered, positionOf } = useOrdered(rules, reorder);
  const [query, setQuery] = useState('');
  const visible = filterRules(ordered, query);
  const tree = buildTree(visible);
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree.map((n) => n.key)));
  const isFiltering = query.trim() !== '';
  const isOpen = (key: string) => isFiltering || open.has(key);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selected = ordered.find((rule) => rule.id === ruleId);

  const renderNode = (node: Node, depth: number) => {
    const enabled = node.rules.filter((rule) => rule.enabled).length;
    const matches = node.rules.reduce((sum, rule) => sum + rule.matchCount, 0);
    const isLeaf = node.children.length === 0;
    const expanded = isOpen(node.key);
    return (
      <li key={node.key}>
        <button
          type="button"
          onClick={() => toggle(node.key)}
          className={`grid w-full grid-cols-[minmax(0,1fr)_5rem_6rem] items-center gap-2 border-b border-zinc-100 py-1.5 pr-4 text-left text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60 ${
            depth === 0 ? 'bg-zinc-50 font-semibold dark:bg-zinc-800/40' : ''
          }`}
          style={{ paddingLeft: `${depth * 1.25 + 0.75}rem` }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`w-3 text-zinc-400 ${expanded ? 'rotate-90' : ''} transition-transform`}
            >
              ›
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">{node.kind}</span>
            <span
              className={`truncate ${node.label === NO_CATEGORY || node.label === NO_PAYEE ? 'italic text-zinc-500' : ''}`}
            >
              {node.label}
            </span>
          </span>
          <span className="text-right text-xs tabular-nums text-zinc-500">
            {enabled}/{node.rules.length} on
          </span>
          <span className="text-right text-xs tabular-nums text-zinc-500">{matches} matches</span>
        </button>
        {expanded && (
          <ul>
            {isLeaf
              ? node.rules.map((rule) => (
                  <li key={rule.id}>
                    <Link
                      href={protoHref('D', { rule: rule.id })}
                      scroll={false}
                      className={`grid grid-cols-[minmax(0,1fr)_5rem_6rem] items-center gap-2 border-b border-zinc-100 py-1.5 pr-4 text-sm hover:bg-sky-50 dark:border-zinc-800 dark:hover:bg-sky-950/40 ${
                        rule.id === ruleId ? 'bg-sky-50 dark:bg-sky-950/40' : ''
                      }`}
                      style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.75}rem` }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-8 text-right text-xs tabular-nums text-zinc-400">
                          #{positionOf(rule.id) + 1}
                        </span>
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        />
                        <span
                          className={`shrink-0 font-medium ${rule.enabled ? '' : 'text-zinc-400'}`}
                        >
                          {rule.name}
                        </span>
                        <span className="truncate text-xs text-zinc-500">
                          {rule.conditions.join(' · ')}
                        </span>
                      </span>
                      <span />
                      <span className="text-right text-xs tabular-nums">{rule.matchCount}</span>
                    </Link>
                  </li>
                ))
              : node.children.map((childNode) => renderNode(childNode, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter instantly — Rule, condition, Payee, Category…"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          onClick={() => setOpen(new Set(allKeys(tree)))}
        >
          Expand all
        </button>
        <button type="button" className={GHOST_BUTTON_CLASS} onClick={() => setOpen(new Set())}>
          Collapse all
        </button>
      </div>
      {ruleOrder.error && <FieldError message={ruleOrder.error} />}
      <ul className={`${CARD_CLASS} overflow-hidden`}>{tree.map((node) => renderNode(node, 0))}</ul>
      {visible.length === 0 && <p className="text-sm text-zinc-500">No Rule matches.</p>}

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-zinc-900/20">
          <Link href={protoHref('D', {})} scroll={false} aria-label="Close" className="flex-1" />
          <div className="h-full w-full max-w-xl overflow-y-auto bg-zinc-50 p-4 shadow-2xl dark:bg-zinc-950">
            <div className="mb-2 flex justify-end">
              <Link href={protoHref('D', {})} scroll={false} className={GHOST_BUTTON_CLASS}>
                Close ✕
              </Link>
            </div>
            <RuleDetail
              rule={selected}
              position={positionOf(selected.id)}
              total={ordered.length}
              isPending={ruleOrder.isPending}
              moveBy={ruleOrder.moveBy}
            />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * PROTOTYPE — throwaway. Shared bits for the Rules page variants behind `?variant=`.
 * Not for main: fold the winning variant in properly, then delete `_prototype/`.
 */
import Link from 'next/link';
import { useState, useTransition, type DragEvent } from 'react';
import { ActionForm } from '@/components/action-form';
import type { ActionResult } from '@/server/actions';
import type { RuleRow } from '../rule-list';

/** A Rule row plus what the variants need to group and badge it. */
export interface ProtoRule extends RuleRow {
  payee: string | null;
  category: string | null;
  tags: string[];
}

export interface VariantProps {
  rows: ProtoRule[];
  reorder: (ids: string[]) => Promise<ActionResult<unknown>>;
  /** The page's search params, for variants that keep a selection or filter in the URL. */
  params: Record<string, string | undefined>;
}

/** `ids` with `id` moved to where `targetId` is. */
function moved(ids: readonly string[], id: string, targetId: string): string[] {
  const without = ids.filter((other) => other !== id);
  const at = ids.indexOf(targetId);
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/** Run order with optimistic drag / move saving, like the current list. */
export function useRuleOrder(rows: ProtoRule[], reorder: VariantProps['reorder']) {
  const [order, setOrder] = useState(() => rows.map((row) => row.id));
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const byId = new Map(rows.map((row) => [row.id, row]));

  const save = (next: string[]) => {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorder(next);
      if (!result.ok) {
        setOrder(previous);
        setError(result.error);
      }
    });
  };
  const moveBy = (id: string, delta: -1 | 1) => {
    const target = order[order.indexOf(id) + delta];
    if (target) save(moved(order, id, target));
  };
  const dragProps = (id: string) => ({
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const from = dragged ?? event.dataTransfer.getData('text/plain');
      setDragged(null);
      if (from && from !== id) save(moved(order, from, id));
    },
  });
  const handleProps = (id: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
      setDragged(id);
    },
    onDragEnd: () => setDragged(null),
  });
  const ordered = order.map((id) => byId.get(id)).filter((row): row is ProtoRule => !!row);
  return { ordered, order, dragged, error, isPending, moveBy, dragProps, handleProps };
}

const CHIP = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium';

export function ConditionChip({ children }: { children: string }) {
  return (
    <span className={`${CHIP} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}>
      {children}
    </span>
  );
}

export function ActionChips({ row }: { row: ProtoRule }) {
  const chips = [
    row.payee && {
      key: 'payee',
      label: `Payee · ${row.payee}`,
      tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    },
    row.category && {
      key: 'category',
      label: row.category,
      tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    },
    ...row.tags.map((tag) => ({
      key: `tag-${tag}`,
      label: `#${tag}`,
      tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    })),
  ].filter((chip): chip is { key: string; label: string; tone: string } => !!chip);
  if (chips.length === 0) return <span className="text-xs text-zinc-400">Sets nothing</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span key={chip.key} className={`${CHIP} ${chip.tone}`}>
          {chip.label}
        </span>
      ))}
    </span>
  );
}

/** An on/off switch posting the Rule's toggle action. */
export function EnabledSwitch({ row }: { row: ProtoRule }) {
  return (
    <ActionForm action={row.toggle} label={`${row.enabled ? 'Disable' : 'Enable'} ${row.name}`}>
      <button
        type="submit"
        role="switch"
        aria-checked={row.enabled}
        aria-label={`${row.name} enabled`}
        className={`relative h-5 w-9 rounded-full transition-colors ${row.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${row.enabled ? 'left-4' : 'left-0.5'}`}
        />
      </button>
    </ActionForm>
  );
}

export function DeleteButton({ row, className }: { row: ProtoRule; className: string }) {
  return (
    <ActionForm
      action={row.remove}
      label={`Delete ${row.name}`}
      confirmMessage={`Delete the Rule "${row.name}"? Transactions it classified keep their classification.`}
    >
      <button type="submit" className={className}>
        Delete
      </button>
    </ActionForm>
  );
}

export function NewRuleLink({ className }: { className: string }) {
  return (
    <Link href="/rules/new" className={className}>
      New Rule
    </Link>
  );
}

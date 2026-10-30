'use client';

import Link from 'next/link';
import { useState, useTransition, type DragEvent } from 'react';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { BUTTON_CLASS } from '@/components/named-list';
import type { ActionResult } from '@/server/actions';

type BoundAction = (previous: ActionResult<unknown> | null) => Promise<ActionResult<unknown>>;

export interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  conditions: string[];
  actions: string;
  toggle: BoundAction;
  remove: BoundAction;
}

interface RuleListProps {
  rows: RuleRow[];
  reorder: (ids: string[]) => Promise<ActionResult<unknown>>;
}

const CELL = 'px-3 py-2 text-left align-top';

/** `ids` with `id` moved to where `targetId` is. */
function moved(ids: readonly string[], id: string, targetId: string): string[] {
  const without = ids.filter((other) => other !== id);
  const at = ids.indexOf(targetId);
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/**
 * The Rules in run order (spec 75): drag a row by its handle to move it, or use the move
 * buttons. Each move saves the whole order.
 */
export function RuleList({ rows, reorder }: RuleListProps) {
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
  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const id = dragged ?? event.dataTransfer.getData('text/plain');
    setDragged(null);
    if (id && id !== targetId) save(moved(order, id, targetId));
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <FieldError message={error} />}
      <table aria-label="Rules" aria-busy={isPending} className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>
              <span className="sr-only">Move</span>
            </th>
            <th className={CELL}>#</th>
            <th className={CELL}>Rule</th>
            <th className={CELL}>When</th>
            <th className={CELL}>Then</th>
            <th className={CELL}>Status</th>
            <th className={CELL}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {order.map((id, index) => {
            const row = byId.get(id);
            if (!row) return null;
            return (
              <tr
                key={id}
                data-rule-id={id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, id)}
                className={`${row.enabled ? '' : 'text-zinc-500'} ${dragged === id ? 'opacity-50' : ''}`}
              >
                <td className={CELL}>
                  <span
                    draggable
                    aria-label={`Drag ${row.name}`}
                    role="img"
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragged(id);
                    }}
                    onDragEnd={() => setDragged(null)}
                    className="cursor-grab select-none px-1 text-zinc-400"
                  >
                    ⠿
                  </span>
                </td>
                <td className={`${CELL} tabular-nums`}>{index + 1}</td>
                <td className={CELL}>
                  <Link href={`/rules/${id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className={CELL}>
                  <ul>
                    {row.conditions.map((condition, i) => (
                      <li key={i}>{condition}</li>
                    ))}
                  </ul>
                </td>
                <td className={CELL}>{row.actions || '—'}</td>
                <td className={CELL}>{row.enabled ? 'Enabled' : 'Disabled'}</td>
                <td className={CELL}>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={BUTTON_CLASS}
                      aria-label={`Move ${row.name} up`}
                      disabled={index === 0 || isPending}
                      onClick={() => moveBy(id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={BUTTON_CLASS}
                      aria-label={`Move ${row.name} down`}
                      disabled={index === order.length - 1 || isPending}
                      onClick={() => moveBy(id, 1)}
                    >
                      ↓
                    </button>
                    <ActionForm
                      action={row.toggle}
                      label={`${row.enabled ? 'Disable' : 'Enable'} ${row.name}`}
                    >
                      <button type="submit" className={BUTTON_CLASS}>
                        {row.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </ActionForm>
                    <ActionForm
                      action={row.remove}
                      label={`Delete ${row.name}`}
                      confirmMessage={`Delete the Rule "${row.name}"? Transactions it classified keep their classification.`}
                    >
                      <button type="submit" className={BUTTON_CLASS}>
                        Delete
                      </button>
                    </ActionForm>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

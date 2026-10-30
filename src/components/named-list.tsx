import Link from 'next/link';
import type { ActionResult } from '@/server/actions';
import { ActionForm } from './action-form';

export const INPUT_CLASS =
  'rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900';
export const BUTTON_CLASS =
  'rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800';

type FormAction = (
  previous: ActionResult<unknown> | null,
  formData: FormData,
) => Promise<ActionResult<unknown>>;

export interface NamedItem {
  id: string;
  name: string;
  transactionCount: number;
}

interface NamedListProps {
  /** "Payee" or "Tag". */
  noun: string;
  items: NamedItem[];
  create: FormAction;
  rename: (id: string) => FormAction;
  /** Merges the item into the one named by the form's `targetId`. */
  merge: (id: string) => FormAction;
  remove: (id: string) => FormAction;
  /** The Transaction list filtered on one item. */
  listHref: (id: string) => string;
  deleteHint: string;
}

/** A managed list of names (Payees, Tags): create, rename, merge and delete. */
export function NamedList({
  noun,
  items,
  create,
  rename,
  merge,
  remove,
  listHref,
  deleteHint,
}: NamedListProps) {
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={create} label={`New ${noun}`}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {noun} name
          <input name="name" required maxLength={100} className={INPUT_CLASS} />
        </label>
        <button type="submit" className={BUTTON_CLASS}>
          Add {noun}
        </button>
      </ActionForm>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No {noun}s yet.</p>
      ) : (
        <ul
          aria-label={`${noun}s`}
          className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
        >
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-4 px-4 py-2">
              <ActionForm action={rename(item.id)} label={`Rename ${item.name}`}>
                <input
                  name="name"
                  aria-label={`Name of ${item.name}`}
                  defaultValue={item.name}
                  required
                  maxLength={100}
                  className={INPUT_CLASS}
                />
                <button type="submit" className={BUTTON_CLASS}>
                  Rename
                </button>
              </ActionForm>
              <Link href={listHref(item.id)} className="py-1 text-sm underline">
                {item.transactionCount} Transaction{item.transactionCount === 1 ? '' : 's'}
              </Link>
              {items.length > 1 && (
                <ActionForm
                  action={merge(item.id)}
                  label={`Merge ${item.name}`}
                  confirmMessage={`Merge "${item.name}" into the chosen ${noun}? This can't be undone.`}
                >
                  <select
                    name="targetId"
                    aria-label={`Merge ${item.name} into`}
                    required
                    className={INPUT_CLASS}
                  >
                    <option value="">Merge into…</option>
                    {items
                      .filter((other) => other.id !== item.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.name}
                        </option>
                      ))}
                  </select>
                  <button type="submit" className={BUTTON_CLASS}>
                    Merge
                  </button>
                </ActionForm>
              )}
              <ActionForm
                action={remove(item.id)}
                label={`Delete ${item.name}`}
                confirmMessage={`Delete "${item.name}"? ${deleteHint}`}
              >
                <button type="submit" className={BUTTON_CLASS}>
                  Delete
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
